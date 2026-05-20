import { clerkClient } from '@clerk/fastify';

import type { ExtendedPrismaClient } from '../db/client.js';

/**
 * Service layer for super-admin impersonation (Phase 2 of the
 * "Sign in as" feature requested 2026-05-20).
 *
 * Phase 2 supports staff/admin/manager targets only — Clerk actor tokens
 * are minted by Clerk's Backend API and consumed client-side. Client
 * (customer) impersonation rides Epic 4's magic-link flow once that
 * surface is built, and is intentionally NOT implemented here.
 */

export class ImpersonationTargetNotFoundError extends Error {
  constructor() {
    super('Target user not found.');
    this.name = 'ImpersonationTargetNotFoundError';
  }
}

export class ImpersonationTargetForbiddenError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ImpersonationTargetForbiddenError';
  }
}

export class ImpersonationActorMissingClerkIdError extends Error {
  constructor() {
    super('Actor user has no Clerk userId — cannot mint actor token.');
    this.name = 'ImpersonationActorMissingClerkIdError';
  }
}

export class ImpersonationTargetMissingClerkIdError extends Error {
  constructor() {
    super('Target user has no Clerk userId — only staff/admin/manager targets are supported in Phase 2.');
    this.name = 'ImpersonationTargetMissingClerkIdError';
  }
}

type StartImpersonationParams = {
  actor: { id: string; clerkUserId: string };
  targetUserId: string;
  // How long the minted token itself is valid for the client to exchange.
  // Defaults to 60 seconds — the client should exchange it immediately.
  tokenExpiresInSeconds?: number;
  // How long the resulting impersonation session lasts. Defaults to 1 hour;
  // when this expires the super-admin must re-mint and re-exchange.
  sessionMaxDurationInSeconds?: number;
};

type StartImpersonationResult = {
  actorTokenId: string;
  token: string;
  url: string | null;
  expiresAt: string; // ISO timestamp
  target: {
    id: string;
    clerkUserId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

export async function startImpersonation(
  prisma: ExtendedPrismaClient,
  params: StartImpersonationParams,
): Promise<StartImpersonationResult> {
  const tokenTtlSeconds = params.tokenExpiresInSeconds ?? 60;
  const sessionMaxSeconds = params.sessionMaxDurationInSeconds ?? 3600;

  // Refuse to impersonate the actor themselves — protects against UI bugs.
  if (params.actor.id === params.targetUserId) {
    throw new ImpersonationTargetForbiddenError(
      'Cannot impersonate yourself.',
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: {
      id: true,
      clerkUserId: true,
      email: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      roleAssignments: {
        select: {
          tenantId: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  if (!target || target.deletedAt) {
    throw new ImpersonationTargetNotFoundError();
  }

  // Hard rule: super-admin cannot impersonate another super-admin.
  // Prevents an attacker who compromises one super-admin from escalating
  // through impersonation to a second super-admin's audit trail.
  const targetIsSuperAdmin = target.roleAssignments.some(
    (a) => a.role.name === 'super_admin',
  );
  if (targetIsSuperAdmin) {
    throw new ImpersonationTargetForbiddenError(
      'Cannot impersonate another super_admin.',
    );
  }

  if (!target.clerkUserId) {
    // Magic-link / customer accounts will land here. Phase 2 doesn't cover
    // that path; the caller should route to the client-impersonation
    // endpoint (not yet built) instead.
    throw new ImpersonationTargetMissingClerkIdError();
  }

  // Mint the Clerk actor token. The client receives `token` and uses
  // Clerk JS's `Clerk.client.signIn.create({ strategy: 'ticket', ticket })`
  // (or equivalent) to swap into the impersonation session.
  const actorToken = await clerkClient.actorTokens.create({
    userId: target.clerkUserId,
    actor: { sub: params.actor.clerkUserId },
    expiresInSeconds: tokenTtlSeconds,
    sessionMaxDurationInSeconds: sessionMaxSeconds,
  });

  if (!actorToken.token) {
    throw new Error(
      'Clerk returned an actor token row without a token string — check Clerk Backend API behavior.',
    );
  }

  return {
    actorTokenId: actorToken.id,
    token: actorToken.token,
    url: actorToken.url ?? null,
    // Token expiry derived from current time + ttl; Clerk's response uses
    // millisecond timestamps that aren't standardized across SDK versions,
    // so we compute locally for the API response contract.
    expiresAt: new Date(Date.now() + tokenTtlSeconds * 1000).toISOString(),
    target: {
      id: target.id,
      clerkUserId: target.clerkUserId,
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
    },
  };
}

type WriteImpersonationAuditParams = {
  tenantId: string;
  actorUserId: string;
  subjectUserId: string;
  action:
    | 'impersonation.started'
    | 'impersonation.ended'
    | 'impersonation.token_minted';
  entityId: string; // typically the actor token id or the session id
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeImpersonationAudit(
  prisma: ExtendedPrismaClient,
  params: WriteImpersonationAuditParams,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      actorType: 'user',
      subjectUserId: params.subjectUserId,
      action: params.action,
      entityType: 'impersonation',
      entityId: params.entityId,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}
