// Automation context enricher — turns a raw AutomationEvent into the rich
// context object the engine + condition eval consumes.
//
// PR 3 of the Automation System epic. The trigger dispatcher
// (automationTriggerDispatcher.ts) calls `enrichEventContext` after matching
// a workflow, then stores the result in `automation_run.context_json`. The
// engine reads it back via `coerceRunContext` and condition rules reference
// fields like `'client.tags'` or `'appointment.serviceId'`.
//
// Design notes:
//   - Best-effort: every loader handles `null` cleanly. If a target row has
//     been deleted between event emission and dispatch, the enricher returns
//     a base context with `event.data` + `tenant` only. Condition eval treats
//     missing fields as failing rules (defense-in-depth).
//   - Tenant-scoped: every Prisma lookup is filtered by `event.tenantId`.
//     There is NO code path that crosses tenants.
//   - JSON-safe output: Date → ISO string, Decimal → number (the booking
//     domain already keeps money in integer cents, so Decimal only shows up
//     for staff.commissionRatePct + geofence lat/lng — small fixed-precision
//     values where Number is fine).
//   - Branches on the `event.type` prefix. PR 11 + PR 12 emit `booking.*`
//     and `form.*` events first, so those branches are fully enriched.
//     `client.*` is covered because PR 13 wires it. Other categories
//     (payment / membership / package / soap / file / staff / note / alert)
//     get base-context-only stubs until the corresponding epic emits them —
//     adding richer enrichment is a one-function change.
//
// Pure-ish — depends on Prisma but no other side effects. No event emission,
// no writes.
//
// PRs touching this file later: PR 13 (client/file/staff/note/alert publishers),
// Epic 6 (payment), memberships epic (membership/package), clinical epics
// (soap/clinical). Each adds a loader + branch.
//
// What the engine + condition eval expect (the schema this file outputs):
// {
//   event: { type, eventId, timestamp (ISO), data (raw payload) },
//   tenant: { id, name, slug } | null,
//   workflow: { id, name },
//   client?: { id, firstName, lastName, email, phone, tags: string[], ... } | null,
//   appointment?: { id, state, scheduledStartAt (ISO), serviceId, staffId, ... } | null,
//   classBooking?: { id, state, classInstanceId, clientId, ... } | null,
//   service?: { id, name, durationMinutes, basePriceCents, ... } | null,
//   provider?: { id (alias of staffId), firstName, lastName, ... } | null,
//   submission?: { id, status, definitionId, ... } | null,
// }

import type { AutomationWorkflow } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import type { AutomationEvent } from '../lib/automationEventBus.js';

type EnrichedContext = Record<string, unknown>;

// ----- Public entry point -----

export async function enrichEventContext(
  prisma: ExtendedPrismaClient,
  event: AutomationEvent,
  workflow: AutomationWorkflow,
): Promise<EnrichedContext> {
  const baseContext: EnrichedContext = {
    event: {
      type: event.type,
      eventId: event.eventId,
      timestamp: event.timestamp.toISOString(),
      data: event.data ?? null,
    },
    tenant: await loadTenant(prisma, event.tenantId),
    workflow: { id: workflow.id, name: workflow.name },
  };

  const data = (event.data && typeof event.data === 'object'
    ? (event.data as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  // ----- booking.* -----
  if (event.type.startsWith('booking.')) {
    const appointmentId = readString(data, 'appointmentId');
    const classBookingId = readString(data, 'classBookingId');
    const clientId = readString(data, 'clientId');

    const [appointment, classBooking, client] = await Promise.all([
      appointmentId ? loadAppointment(prisma, event.tenantId, appointmentId) : Promise.resolve(null),
      classBookingId ? loadClassBooking(prisma, event.tenantId, classBookingId) : Promise.resolve(null),
      clientId ? loadClient(prisma, event.tenantId, clientId) : Promise.resolve(null),
    ]);

    // Service + provider are derived from the appointment we already loaded
    // (avoids a second Appointment query). For class events these stay null —
    // they could be enriched from the class instance if a real need surfaces.
    const service = appointment?._service ?? null;
    const provider = appointment?._provider ?? null;

    return {
      ...baseContext,
      appointment: appointment?.dto ?? null,
      classBooking,
      client: client ?? (await loadClientFromAppointment(prisma, event.tenantId, appointment?.dto?.clientId)),
      service,
      provider,
    };
  }

  // ----- client.* -----
  if (event.type.startsWith('client.')) {
    const clientId = readString(data, 'clientId');
    const client = clientId ? await loadClient(prisma, event.tenantId, clientId) : null;
    return { ...baseContext, client };
  }

  // ----- form.* -----
  if (event.type.startsWith('form.')) {
    const submissionId = readString(data, 'submissionId');
    const clientId = readString(data, 'clientId');

    const submission = submissionId
      ? await loadFormSubmission(prisma, event.tenantId, submissionId)
      : null;

    // Prefer explicit clientId, fall back to whatever the submission carries.
    const resolvedClientId =
      clientId ?? (submission?.clientId ?? null) ?? null;
    const client = resolvedClientId
      ? await loadClient(prisma, event.tenantId, resolvedClientId)
      : null;

    return { ...baseContext, submission, client };
  }

  // ----- file.* / staff.* / note.* / alert.* / soap.* / clinical.* -----
  // Base context only — when these publishers wire (PR 13+ for files/staff,
  // future epics for clinical), extend with per-loader enrichment.
  if (
    event.type.startsWith('file.') ||
    event.type.startsWith('staff.') ||
    event.type.startsWith('note.') ||
    event.type.startsWith('alert.') ||
    event.type.startsWith('soap.') ||
    event.type.startsWith('clinical.') ||
    event.type.startsWith('payment.') ||
    event.type.startsWith('membership.') ||
    event.type.startsWith('package.')
  ) {
    return baseContext;
  }

  // Unknown prefix — base context only.
  return baseContext;
}

// ----- Helpers -----

function readString(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const v = data[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Prisma Decimal exposes toString(); the booking domain keeps these to small
  // fixed-precision values (e.g. commission % 0..100), so Number() is safe.
  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const n = Number((value as { toString: () => string }).toString());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isoOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

// ----- Loaders -----

async function loadTenant(
  prisma: ExtendedPrismaClient,
  tenantId: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const t = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  return t ?? null;
}

async function loadClient(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  clientId: string,
): Promise<EnrichedContext | null> {
  const c = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    include: {
      tagAssignments: { include: { tag: true } },
    },
  });
  if (!c) return null;

  const tagLabels: string[] = [];
  for (const ta of c.tagAssignments) {
    if (ta.tag?.name) tagLabels.push(ta.tag.name);
  }

  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName ?? null,
    preferredName: c.preferredName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    dateOfBirth: isoOrNull(c.dateOfBirth),
    tags: tagLabels,
    smsOptedOut: c.smsOptedOut,
    emailOptedOut: c.emailOptedOut,
    preferredChannel: c.preferredChannel ?? null,
    banned: c.banned,
    intakeStatus: c.intakeStatus,
    clientNumber: c.clientNumber,
    createdAt: isoOrNull(c.createdAt),
  };
}

// Internal shape: the booking branch needs the raw appointment to derive
// service + provider context, so we return both the JSON-safe dto and the
// pre-resolved sub-contexts.
interface AppointmentEnriched {
  dto: EnrichedContext & { clientId: string };
  _service: EnrichedContext | null;
  _provider: EnrichedContext | null;
}

async function loadAppointment(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  appointmentId: string,
): Promise<AppointmentEnriched | null> {
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: {
      service: true,
      staff: true,
      location: true,
    },
  });
  if (!a) return null;

  const dto = {
    id: a.id,
    state: a.state,
    source: a.source ?? null,
    scheduledStartAt: isoOrNull(a.scheduledStartAt),
    scheduledEndAt: isoOrNull(a.scheduledEndAt),
    locationId: a.locationId,
    clientId: a.clientId,
    staffId: a.staffId,
    serviceId: a.serviceId,
    bookedBasePriceCents: a.bookedBasePriceCents,
    notes: a.notes ?? null,
    cancelledAt: isoOrNull(a.cancelledAt),
    cancelReason: a.cancelReason ?? null,
    createdAt: isoOrNull(a.createdAt),
  };

  const _service = a.service
    ? {
        id: a.service.id,
        name: a.service.name,
        durationMinutes: a.service.durationMinutes,
        basePriceCents: a.service.basePriceCents,
        categoryId: a.service.categoryId ?? null,
        bookingPolicy: a.service.bookingPolicy,
        active: a.service.active,
      }
    : null;

  const _provider = a.staff
    ? {
        id: a.staff.id,
        firstName: a.staff.firstName,
        lastName: a.staff.lastName ?? null,
        email: a.staff.email ?? null,
        phone: a.staff.phone ?? null,
        jobTitle: a.staff.jobTitle ?? null,
        active: a.staff.active,
        commissionRatePct: decimalToNumber(a.staff.commissionRatePct),
      }
    : null;

  return { dto, _service, _provider };
}

async function loadClientFromAppointment(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  clientId: string | undefined,
): Promise<EnrichedContext | null> {
  if (!clientId) return null;
  return loadClient(prisma, tenantId, clientId);
}

async function loadClassBooking(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  classBookingId: string,
): Promise<EnrichedContext | null> {
  const b = await prisma.classBooking.findFirst({
    where: { id: classBookingId, tenantId },
    include: {
      classInstance: { include: { class: true } },
    },
  });
  if (!b) return null;

  return {
    id: b.id,
    state: b.state,
    clientId: b.clientId,
    classInstanceId: b.classInstanceId,
    bookedAt: isoOrNull(b.bookedAt),
    checkInMethod: b.checkInMethod ?? null,
    checkedInAt: isoOrNull(b.checkedInAt),
    late: b.late,
    cancelledAt: isoOrNull(b.cancelledAt),
    cancellationReason: b.cancellationReason ?? null,
    classInstance: b.classInstance
      ? {
          id: b.classInstance.id,
          classId: b.classInstance.classId,
          staffId: b.classInstance.staffId,
          locationId: b.classInstance.locationId,
          scheduledStartAt: isoOrNull(b.classInstance.scheduledStartAt),
          scheduledEndAt: isoOrNull(b.classInstance.scheduledEndAt),
          state: b.classInstance.state,
          class: b.classInstance.class
            ? {
                id: b.classInstance.class.id,
                name: b.classInstance.class.name,
                durationMinutes: b.classInstance.class.durationMinutes,
                maxCapacity: b.classInstance.class.maxCapacity,
              }
            : null,
        }
      : null,
  };
}

async function loadFormSubmission(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  submissionId: string,
): Promise<(EnrichedContext & { clientId: string | null }) | null> {
  const s = await prisma.intakeFormSubmission.findFirst({
    where: { id: submissionId, tenantId },
    include: {
      definition: true,
    },
  });
  if (!s) return null;

  return {
    id: s.id,
    status: s.status,
    definitionId: s.definitionId,
    clientId: s.clientId ?? null,
    appointmentId: s.appointmentId ?? null,
    answers: (s.answers ?? null) as unknown,
    submittedAt: isoOrNull(s.submittedAt),
    openedAt: isoOrNull(s.openedAt),
    startedAt: isoOrNull(s.startedAt),
    expiresAt: isoOrNull(s.expiresAt),
    deliveryChannel: s.deliveryChannel ?? null,
    reviewStatus: s.reviewStatus ?? null,
    reviewedAt: isoOrNull(s.reviewedAt),
    definition: s.definition
      ? {
          id: s.definition.id,
          title: s.definition.title,
          formType: s.definition.formType ?? null,
          version: s.definition.version,
          groupId: s.definition.groupId,
        }
      : null,
  };
}
