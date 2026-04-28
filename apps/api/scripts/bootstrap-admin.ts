/**
 * Bootstrap admin script — Epic 1 sub-step 8
 *
 * Creates a Tenant + default Location, claims an orphan user as admin.
 * One-shot, idempotent, atomic. Run from a trusted laptop with the
 * production DATABASE_URL in .env.
 *
 * Usage:
 *   pnpm --filter @wellos/api bootstrap:admin -- \
 *     --email johnathan.carlson@me.com \
 *     --tenant-name "Wellos" \
 *     [--tenant-slug "wellos"] \
 *     [--location-name "Main"]
 *
 * Idempotent: re-running with the same args is safe.
 *   - Tenant upserted by slug
 *   - User claim no-op if already in this tenant; refuses if user is in
 *     a different tenant
 *   - Location created only if no Location with the same name exists
 *   - RoleAssignment upserted by composite key
 *
 * Audit log: every state change writes to audit_log with actorType='system'.
 */

import { parseArgs } from 'node:util';

import { Prisma, PrismaClient } from '@prisma/client';

type Args = {
  email: string;
  tenantName: string;
  tenantSlug: string;
  locationName: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseAndValidateArgs(): Args {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'tenant-name': { type: 'string' },
      'tenant-slug': { type: 'string' },
      'location-name': { type: 'string' },
    },
    strict: true,
  });

  const email = values.email?.trim();
  const tenantName = values['tenant-name']?.trim();
  if (!email) throw new Error('--email is required');
  if (!tenantName) throw new Error('--tenant-name is required');

  const tenantSlug = values['tenant-slug']?.trim() || slugify(tenantName);
  const locationName = values['location-name']?.trim() || tenantName;

  return { email, tenantName, tenantSlug, locationName };
}

async function main(): Promise<void> {
  const args = parseAndValidateArgs();
  // Prefer DIRECT_URL (session pooler, port 5432) for one-off scripts —
  // the transaction pooler (DATABASE_URL, port 6543) breaks Prisma's
  // prepared statements ("prepared statement s0 already exists") even
  // with ?pgbouncer=true. The session pooler handles them correctly.
  // Falls back to DATABASE_URL if DIRECT_URL isn't set.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : {});

  try {
    const candidates = await prisma.user.findMany({
      where: { email: args.email, deletedAt: null },
      select: {
        id: true,
        clerkUserId: true,
        email: true,
        tenantId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (candidates.length === 0) {
      throw new Error(
        `No user found with email "${args.email}". The Clerk webhook may not have synced this user yet — check users table in Supabase.`,
      );
    }
    if (candidates.length > 1) {
      throw new Error(
        `Multiple users with email "${args.email}":\n${candidates
          .map((c) => `  - id=${c.id} clerkUserId=${c.clerkUserId} tenantId=${c.tenantId}`)
          .join('\n')}\nAdd a --clerk-user-id flag to disambiguate (not yet implemented; pick one and update by hand).`,
      );
    }
    const user = candidates[0]!;

    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    if (!adminRole) {
      throw new Error('Admin role not found. Run `pnpm --filter @wellos/api db:seed` first.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const audits: Array<{
        action: string;
        entityType: string;
        entityId: string;
        before: unknown;
        after: unknown;
        tenantId: string | null;
      }> = [];

      let tenant = await tx.tenant.findUnique({ where: { slug: args.tenantSlug } });
      let tenantCreated = false;
      if (!tenant) {
        tenant = await tx.tenant.create({
          data: { name: args.tenantName, slug: args.tenantSlug },
        });
        tenantCreated = true;
        audits.push({
          action: 'tenant.created',
          entityType: 'tenant',
          entityId: tenant.id,
          before: null,
          after: tenant,
          tenantId: tenant.id,
        });
      } else if (tenant.name !== args.tenantName) {
        throw new Error(
          `Tenant slug "${args.tenantSlug}" already exists with name "${tenant.name}" (you passed "${args.tenantName}"). Pick a different slug or use the existing name.`,
        );
      }

      if (user.tenantId && user.tenantId !== tenant.id) {
        throw new Error(
          `User ${user.id} is already claimed by tenant ${user.tenantId} (you targeted ${tenant.id}). Cannot reassign.`,
        );
      }

      let userClaimed = false;
      if (!user.tenantId) {
        const before = await tx.user.findUnique({ where: { id: user.id } });
        const after = await tx.user.update({
          where: { id: user.id },
          data: { tenantId: tenant.id },
        });
        userClaimed = true;
        audits.push({
          action: 'user.tenant_claimed',
          entityType: 'user',
          entityId: user.id,
          before,
          after,
          tenantId: tenant.id,
        });
      }

      const existingLocation = await tx.location.findFirst({
        where: { tenantId: tenant.id, name: args.locationName, deletedAt: null },
      });
      let locationCreated = false;
      let location = existingLocation;
      if (!location) {
        location = await tx.location.create({
          data: { tenantId: tenant.id, name: args.locationName },
        });
        locationCreated = true;
        audits.push({
          action: 'location.created',
          entityType: 'location',
          entityId: location.id,
          before: null,
          after: location,
          tenantId: tenant.id,
        });
      }

      const existingAssignment = await tx.roleAssignment.findUnique({
        where: {
          tenantId_userId_roleId: {
            tenantId: tenant.id,
            userId: user.id,
            roleId: adminRole.id,
          },
        },
      });
      let roleAssigned = false;
      let assignment = existingAssignment;
      if (!assignment) {
        assignment = await tx.roleAssignment.create({
          data: { tenantId: tenant.id, userId: user.id, roleId: adminRole.id },
        });
        roleAssigned = true;
        audits.push({
          action: 'user.role_assigned',
          entityType: 'role_assignment',
          entityId: assignment.id,
          before: null,
          after: assignment,
          tenantId: tenant.id,
        });
      }

      for (const a of audits) {
        await tx.auditLog.create({
          data: {
            tenantId: a.tenantId,
            actorUserId: null,
            actorType: 'system',
            action: a.action,
            entityType: a.entityType,
            entityId: a.entityId,
            before: a.before ? (a.before as Prisma.InputJsonValue) : Prisma.JsonNull,
            after: a.after ? (a.after as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });
      }

      return {
        tenant,
        location,
        assignment,
        tenantCreated,
        userClaimed,
        locationCreated,
        roleAssigned,
      };
    });

    console.log('\n=== Bootstrap admin complete ===');
    console.log(
      `Tenant:           ${result.tenant.name} (${result.tenant.slug}) — id=${result.tenant.id}${
        result.tenantCreated ? ' [CREATED]' : ' [existing]'
      }`,
    );
    console.log(
      `Location:         ${result.location?.name} — id=${result.location?.id}${
        result.locationCreated ? ' [CREATED]' : ' [existing]'
      }`,
    );
    console.log(
      `User:             ${user.firstName ?? ''} ${user.lastName ?? ''} <${user.email}> — id=${user.id}${
        result.userClaimed ? ' [CLAIMED]' : ' [already in tenant]'
      }`,
    );
    console.log(
      `Role assignment:  admin — id=${result.assignment?.id}${
        result.roleAssigned ? ' [CREATED]' : ' [existing]'
      }`,
    );
    console.log('================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nbootstrap-admin failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
