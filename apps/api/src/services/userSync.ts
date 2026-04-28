import { Prisma } from '@prisma/client';
import type { ActorType, PrismaClient, User } from '@prisma/client';

// Pure DB layer for Clerk webhook events. Idempotent by design:
//   user.created  → upsert by clerkUserId
//   user.updated  → upsert by clerkUserId (Clerk retries don't strictly distinguish)
//   user.deleted  → soft delete + null out clerkUserId
//
// Out-of-order delivery is safe: single-event replay lands the same row state;
// delete of a non-existent row is a no-op. Re-signup with the same email after
// a soft-delete creates a fresh orphan row (Postgres treats NULL tenant_id as
// distinct in the (tenant_id, email) unique constraint).

type ClerkEmailAddress = { id: string; email_address: string };

type ClerkUserCreatedOrUpdated = {
  type: 'user.created' | 'user.updated';
  data: {
    id: string;
    email_addresses: ClerkEmailAddress[];
    primary_email_address_id: string | null;
    first_name: string | null;
    last_name: string | null;
  };
};

type ClerkUserDeleted = {
  type: 'user.deleted';
  data: { id: string; deleted: true };
};

export type ClerkWebhookEvent = ClerkUserCreatedOrUpdated | ClerkUserDeleted;

function pickPrimaryEmail(d: ClerkUserCreatedOrUpdated['data']): string | null {
  if (!d.email_addresses?.length) return null;
  const primary = d.email_addresses.find((e) => e.id === d.primary_email_address_id);
  const chosen = primary ?? d.email_addresses[0];
  return chosen?.email_address ?? null;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string | null;
    action: string;
    entityId: string;
    before: User | null;
    after: User | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: null,
      actorType: 'webhook' satisfies ActorType,
      action: args.action,
      entityType: 'user',
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export type SyncResult = {
  status: 'created' | 'updated' | 'deleted' | 'noop';
  userId: string | null;
};

export async function syncUserFromClerk(
  prisma: PrismaClient,
  event: ClerkWebhookEvent,
): Promise<SyncResult> {
  if (event.type === 'user.deleted') {
    return prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { clerkUserId: event.data.id },
      });
      if (!before || before.deletedAt) {
        return { status: 'noop', userId: before?.id ?? null };
      }
      const after = await tx.user.update({
        where: { id: before.id },
        data: { deletedAt: new Date(), clerkUserId: null },
      });
      await writeAudit(tx, {
        tenantId: before.tenantId,
        action: 'user.deleted',
        entityId: before.id,
        before,
        after,
      });
      return { status: 'deleted', userId: after.id };
    });
  }

  // created or updated
  const email = pickPrimaryEmail(event.data);
  if (!email) {
    throw new Error(`Clerk ${event.type} for ${event.data.id} has no email`);
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { clerkUserId: event.data.id },
    });
    const after = await tx.user.upsert({
      where: { clerkUserId: event.data.id },
      // tenantId omitted from create → defaults to NULL (orphan user).
      // Bootstrap admin (sub-step 8) and Epic 2 invite flow assign later.
      create: {
        clerkUserId: event.data.id,
        email,
        firstName: event.data.first_name,
        lastName: event.data.last_name,
      },
      update: {
        email,
        firstName: event.data.first_name,
        lastName: event.data.last_name,
        // Defensive: re-signup with same Clerk ID after soft-delete → un-delete.
        deletedAt: null,
      },
    });
    await writeAudit(tx, {
      tenantId: after.tenantId,
      action: event.type,
      entityId: after.id,
      before,
      after,
    });
    return { status: before ? 'updated' : 'created', userId: after.id };
  });
}
