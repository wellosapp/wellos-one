import { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../db/client.js';
import { sendForm } from './formSendService.js';

// Forms System PR 5 — per-service form attachment rules + booking-time
// auto-assignment of IntakeFormSubmission drafts.
//
// Architecture notes:
//   - A FormAssignmentRule maps a Service to a form group (groupId) — NOT a
//     specific IntakeFormDefinition. Resolution to a concrete row happens at
//     runtime: "latest published version where groupId matches and tenantId
//     matches." This way publishing a new form version automatically applies
//     to every existing rule.
//   - One rule per (service, form group) pair is enforced by the unique
//     constraint on (service_id, form_definition_group_id).
//   - The web UI lists rules with the resolved form title + form type for
//     display. If no published version exists yet, the rule still lives in
//     the DB and the UI renders an amber warning row.
//   - Hard-required blocking is OUT OF SCOPE here — see PR 8. We just store
//     `required_level` on the rule so a later PR can enforce it.
//   - processBookingAssignments is called by the appointment-create hook
//     AFTER the appointment transaction commits. It is best-effort: it
//     never throws back to the caller and logs DB errors to console.

export type RequiredLevel = 'optional' | 'soft_required' | 'hard_required';
export type Timing = 'before_booking' | 'before_appointment' | 'optional';

export interface FormAssignmentRuleDto {
  id: string;
  serviceId: string;
  formDefinitionGroupId: string;
  /** Resolved at runtime — latest published definition's title for this groupId. */
  formTitle: string;
  /** Resolved at runtime — latest published definition's form_type for this groupId. */
  formType: string;
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertFormAssignmentRuleArgs {
  tenantId: string;
  actorUserId: string;
  serviceId: string;
  formDefinitionGroupId: string;
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
}

export interface UpdateFormAssignmentRuleArgs {
  tenantId: string;
  actorUserId: string;
  ruleId: string;
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
}

export class FormAssignmentRuleNotFoundError extends Error {
  readonly code = 'FORM_ASSIGNMENT_RULE_NOT_FOUND';
  constructor(public readonly ruleId: string) {
    super(`Form assignment rule ${ruleId} not found.`);
    this.name = 'FormAssignmentRuleNotFoundError';
  }
}

export class ServiceNotFoundError extends Error {
  readonly code = 'SERVICE_NOT_FOUND';
  constructor(public readonly serviceId: string) {
    super(`Service ${serviceId} not found.`);
    this.name = 'ServiceNotFoundError';
  }
}

export class FormDefinitionGroupNotFoundError extends Error {
  readonly code = 'FORM_DEFINITION_GROUP_NOT_FOUND';
  constructor(public readonly groupId: string) {
    super(`No intake form definition found for group ${groupId}.`);
    this.name = 'FormDefinitionGroupNotFoundError';
  }
}

export class FormAssignmentRuleConflictError extends Error {
  readonly code = 'RULE_ALREADY_EXISTS';
  constructor() {
    super('A rule already exists for this service + form pair.');
    this.name = 'FormAssignmentRuleConflictError';
  }
}

// ---------- Internal helpers ----------

type RuleRow = {
  id: string;
  tenantId: string;
  serviceId: string;
  formDefinitionGroupId: string;
  requiredLevel: string;
  timing: string;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ResolvedTitle = {
  title: string;
  formType: string;
};

const UNPUBLISHED_PLACEHOLDER: ResolvedTitle = {
  title: '(unpublished form)',
  formType: 'unknown',
};

async function resolveLatestPublishedTitleForGroup(
  prisma: ExtendedPrismaClient | ExtendedTransactionClient,
  tenantId: string,
  groupId: string,
): Promise<ResolvedTitle> {
  const def = await prisma.intakeFormDefinition.findFirst({
    where: {
      tenantId,
      groupId,
      status: 'published',
    },
    orderBy: { version: 'desc' },
    select: { title: true, formType: true },
  });
  if (!def) return UNPUBLISHED_PLACEHOLDER;
  return {
    title: def.title,
    formType: def.formType ?? 'unknown',
  };
}

async function resolveLatestPublishedDefinition(
  prisma: ExtendedPrismaClient | ExtendedTransactionClient,
  tenantId: string,
  groupId: string,
): Promise<{ id: string; version: number; title: string } | null> {
  return prisma.intakeFormDefinition.findFirst({
    where: {
      tenantId,
      groupId,
      status: 'published',
      isActive: true,
    },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, title: true },
  });
}

function ruleToDto(row: RuleRow, resolved: ResolvedTitle): FormAssignmentRuleDto {
  return {
    id: row.id,
    serviceId: row.serviceId,
    formDefinitionGroupId: row.formDefinitionGroupId,
    formTitle: resolved.title,
    formType: resolved.formType,
    requiredLevel: row.requiredLevel as RequiredLevel,
    timing: row.timing as Timing,
    sendAutomaticallyAfterBooking: row.sendAutomaticallyAfterBooking,
    requireProviderReview: row.requireProviderReview,
    expiresAfterDays: row.expiresAfterDays,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertServiceBelongsToTenant(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  serviceId: string,
): Promise<void> {
  const svc = await prisma.service.findFirst({
    where: { id: serviceId, tenantId },
    select: { id: true },
  });
  if (!svc) throw new ServiceNotFoundError(serviceId);
}

async function assertGroupExistsForTenant(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  groupId: string,
): Promise<void> {
  // Group exists if at least one definition row for this (tenant, groupId)
  // exists. Status doesn't matter — admin may attach a draft expecting to
  // publish it; the runtime resolver will skip it until then.
  const def = await prisma.intakeFormDefinition.findFirst({
    where: { tenantId, groupId },
    select: { id: true },
  });
  if (!def) throw new FormDefinitionGroupNotFoundError(groupId);
}

// ---------- Public API ----------

export async function listFormAssignmentRules(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; serviceId: string },
): Promise<{ rules: FormAssignmentRuleDto[] }> {
  await assertServiceBelongsToTenant(prisma, args.tenantId, args.serviceId);

  const rows = await prisma.formAssignmentRule.findMany({
    where: { tenantId: args.tenantId, serviceId: args.serviceId },
    orderBy: { createdAt: 'asc' },
  });

  // Resolve titles per row. A LATERAL join would be cleaner but Prisma 5
  // can't express it without raw SQL; Promise.all on N≈small rows is fine.
  const resolved = await Promise.all(
    rows.map((r) =>
      resolveLatestPublishedTitleForGroup(prisma, args.tenantId, r.formDefinitionGroupId),
    ),
  );

  return {
    rules: rows.map((row, i) => ruleToDto(row, resolved[i] ?? UNPUBLISHED_PLACEHOLDER)),
  };
}

export async function createFormAssignmentRule(
  prisma: ExtendedPrismaClient,
  args: UpsertFormAssignmentRuleArgs,
): Promise<{ rule: FormAssignmentRuleDto }> {
  await assertServiceBelongsToTenant(prisma, args.tenantId, args.serviceId);
  await assertGroupExistsForTenant(prisma, args.tenantId, args.formDefinitionGroupId);

  let created: RuleRow;
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.formAssignmentRule.create({
        data: {
          tenantId: args.tenantId,
          serviceId: args.serviceId,
          formDefinitionGroupId: args.formDefinitionGroupId,
          requiredLevel: args.requiredLevel,
          timing: args.timing,
          sendAutomaticallyAfterBooking: args.sendAutomaticallyAfterBooking,
          requireProviderReview: args.requireProviderReview,
          expiresAfterDays: args.expiresAfterDays,
          active: args.active,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: args.tenantId,
          actorUserId: args.actorUserId,
          actorType: 'user',
          action: 'form_assignment_rule.created',
          entityType: 'form_assignment_rule',
          entityId: row.id,
          before: Prisma.JsonNull,
          after: row as unknown as Prisma.InputJsonValue,
        },
      });

      return row;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new FormAssignmentRuleConflictError();
    }
    throw err;
  }

  const resolved = await resolveLatestPublishedTitleForGroup(
    prisma,
    args.tenantId,
    created.formDefinitionGroupId,
  );
  return { rule: ruleToDto(created, resolved) };
}

export async function updateFormAssignmentRule(
  prisma: ExtendedPrismaClient,
  args: UpdateFormAssignmentRuleArgs,
): Promise<{ rule: FormAssignmentRuleDto }> {
  const existing = await prisma.formAssignmentRule.findFirst({
    where: { id: args.ruleId, tenantId: args.tenantId },
  });
  if (!existing) throw new FormAssignmentRuleNotFoundError(args.ruleId);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.formAssignmentRule.update({
      where: { id: existing.id },
      data: {
        requiredLevel: args.requiredLevel,
        timing: args.timing,
        sendAutomaticallyAfterBooking: args.sendAutomaticallyAfterBooking,
        requireProviderReview: args.requireProviderReview,
        expiresAfterDays: args.expiresAfterDays,
        active: args.active,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorType: 'user',
        action: 'form_assignment_rule.updated',
        entityType: 'form_assignment_rule',
        entityId: row.id,
        before: existing as unknown as Prisma.InputJsonValue,
        after: row as unknown as Prisma.InputJsonValue,
      },
    });

    return row;
  });

  const resolved = await resolveLatestPublishedTitleForGroup(
    prisma,
    args.tenantId,
    updated.formDefinitionGroupId,
  );
  return { rule: ruleToDto(updated, resolved) };
}

export async function deleteFormAssignmentRule(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string; ruleId: string },
): Promise<void> {
  const existing = await prisma.formAssignmentRule.findFirst({
    where: { id: args.ruleId, tenantId: args.tenantId },
  });
  if (!existing) throw new FormAssignmentRuleNotFoundError(args.ruleId);

  await prisma.$transaction(async (tx) => {
    await tx.formAssignmentRule.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorType: 'user',
        action: 'form_assignment_rule.deleted',
        entityType: 'form_assignment_rule',
        entityId: existing.id,
        before: existing as unknown as Prisma.InputJsonValue,
        after: Prisma.JsonNull,
      },
    });
  });
}

// ---------- Booking-time auto-assignment ----------
//
// Called by appointmentService.createAppointment AFTER the appointment
// transaction commits. Best-effort: any thrown error inside this function
// is swallowed (logged to console) so booking always succeeds.

export interface ProcessBookingAssignmentsArgs {
  tenantId: string;
  serviceId: string;
  appointmentId: string;
  clientId: string | null;
}

export interface ProcessBookingAssignmentsResult {
  created: number;
  skipped: number;
}

export async function processBookingAssignments(
  prisma: ExtendedPrismaClient,
  args: ProcessBookingAssignmentsArgs,
): Promise<ProcessBookingAssignmentsResult> {
  // Auto-assignment needs a client to assign to. Unauthenticated public
  // bookings (clientId === null is impossible today since the public booking
  // path always resolves-or-creates a Client, but the type allows it for
  // future surfaces) get magic-link delivery in PR 6.
  if (!args.clientId) return { created: 0, skipped: 0 };

  // Pull all rules that should fire on booking. timing values 'before_booking'
  // and 'before_appointment' both qualify here — PR 8 will fork 'before_booking'
  // into the inline-booking flow. 'optional' rules are attached forms that
  // staff send manually; they do not auto-create on booking.
  const rules = await prisma.formAssignmentRule.findMany({
    where: {
      tenantId: args.tenantId,
      serviceId: args.serviceId,
      active: true,
      sendAutomaticallyAfterBooking: true,
      timing: { in: ['before_booking', 'before_appointment'] },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const rule of rules) {
    try {
      const def = await resolveLatestPublishedDefinition(
        prisma,
        args.tenantId,
        rule.formDefinitionGroupId,
      );
      if (!def) {
        // Rule references a form that hasn't been published. Log + skip;
        // the admin will see the amber warning row in the UI.
        // eslint-disable-next-line no-console
        console.info(
          '[form-assignment] skipping rule %s — no published version for group %s',
          rule.id,
          rule.formDefinitionGroupId,
        );
        skipped += 1;
        continue;
      }

      // Idempotency: skip if a submission for this (definition, appointment)
      // already exists in any status. Manual resend is admin-initiated only —
      // we do NOT auto-trigger another send on a re-process. This guards
      // against double-creation if an admin re-saves a service form rule or
      // the appointment-create hook ever fires twice.
      const existing = await prisma.intakeFormSubmission.findFirst({
        where: {
          tenantId: args.tenantId,
          definitionId: def.id,
          appointmentId: args.appointmentId,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const expiresAt =
        rule.expiresAfterDays !== null
          ? new Date(Date.now() + rule.expiresAfterDays * 86_400_000)
          : null;

      // Auto-detect the channel before the transaction so we can store the
      // resolved value on the submission row (sendForm will overwrite if it
      // also passes through). 'email' > 'sms' > 'admin_only' per PR 6.
      let autoChannel: 'email' | 'sms' | 'admin_only' = 'admin_only';
      if (args.clientId) {
        const c = await prisma.client.findFirst({
          where: { id: args.clientId, tenantId: args.tenantId },
          select: { email: true, phone: true },
        });
        if (c?.email) autoChannel = 'email';
        else if (c?.phone) autoChannel = 'sms';
      }

      const createdSubmission = await prisma.$transaction(async (tx) => {
        const submission = await tx.intakeFormSubmission.create({
          data: {
            tenantId: args.tenantId,
            definitionId: def.id,
            clientId: args.clientId,
            appointmentId: args.appointmentId,
            status: 'draft',
            deliveryChannel: autoChannel,
            ...(expiresAt ? { expiresAt } : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: args.tenantId,
            actorUserId: null,
            actorType: 'system',
            action: 'intake_form_submission.created',
            entityType: 'intake_form_submission',
            entityId: submission.id,
            before: Prisma.JsonNull,
            after: {
              source: 'booking_assignment',
              ruleId: rule.id,
              definitionId: def.id,
              definitionVersion: def.version,
              appointmentId: args.appointmentId,
              clientId: args.clientId,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return submission;
      });

      created += 1;

      // PR 6 — auto-dispatch via the send service. Best-effort: a failure
      // here leaves the submission in 'draft' so the admin can manually
      // send later from the client intake panel.
      try {
        await sendForm(prisma, {
          tenantId: args.tenantId,
          actorUserId: null,
          submissionId: createdSubmission.id,
          deliveryChannel: autoChannel,
        });
      } catch (sendErr) {
        // eslint-disable-next-line no-console
        console.warn(
          '[form-assignment] auto-send failed for submission %s (rule %s): %s',
          createdSubmission.id,
          rule.id,
          sendErr instanceof Error ? sendErr.message : String(sendErr),
        );
      }
    } catch (err) {
      // Per spec: never let one failed rule break the others (or the
      // appointment that already committed). Log + continue.
      // eslint-disable-next-line no-console
      console.warn(
        '[form-assignment] rule %s failed for appointment %s: %s',
        rule.id,
        args.appointmentId,
        err instanceof Error ? err.message : String(err),
      );
      skipped += 1;
    }
  }

  return { created, skipped };
}
