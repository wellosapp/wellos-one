import type { Prisma } from '@prisma/client';
import type {
  Appointment,
  AppointmentBookingAnswer,
  Client,
  ClientNote,
  MediaAsset,
  Service,
  SoapNote,
  Staff,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import type { ClientTimelineQuery } from '../schemas/linkedRecords.js';

// Aggregator service for the Tier-A read-only views (E3-S4b).
//
// Two queries — both pull data from ClientNote + Appointment +
// AppointmentBookingAnswer + MediaAsset + SoapNote and return shapes
// the UI can render without further joins.
//
// Soft-delete: every read goes through the Prisma extension (auto
// `deletedAt: null` filter). MediaAsset / SoapNote / ClientNote all
// soft-delete; Appointment soft-deletes; BookingAnswer is append-only.
//
// Tenant scoping: every query passes tenantId. Cross-tenant entity
// lookups return empty results (caller maps to 404 at the route layer).

// ---------- shared safe-field projections ----------

const APPOINTMENT_SUMMARY_FIELDS = {
  id: true,
  tenantId: true,
  locationId: true,
  clientId: true,
  staffId: true,
  serviceId: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  state: true,
  source: true,
  notes: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
} satisfies Prisma.AppointmentSelect;

const CLIENT_SUMMARY_FIELDS = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  banned: true,
  bannedReason: true,
  smsOptedOut: true,
  emailOptedOut: true,
  preferredChannel: true,
} satisfies Prisma.ClientSelect;

const SERVICE_SUMMARY_FIELDS = {
  id: true,
  name: true,
  durationMinutes: true,
  basePriceCents: true,
  color: true,
  active: true,
} satisfies Prisma.ServiceSelect;

const STAFF_SUMMARY_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  active: true,
} satisfies Prisma.StaffSelect;

const NOTE_SUMMARY_FIELDS = {
  id: true,
  tenantId: true,
  clientId: true,
  category: true,
  priority: true,
  title: true,
  body: true,
  appointmentId: true,
  serviceId: true,
  authorType: true,
  authorStaffId: true,
  authorClientId: true,
  authorUserId: true,
  sourceSurface: true,
  visibility: true,
  customerVisible: true,
  alertTriggers: true,
  pinned: true,
  expiresAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientNoteSelect;

const SOAP_NOTE_FIELDS = {
  id: true,
  tenantId: true,
  appointmentId: true,
  authorStaffId: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  additionalNotes: true,
  locked: true,
  lockedAt: true,
  lockedByStaffId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SoapNoteSelect;

const BOOKING_ANSWER_FIELDS = {
  id: true,
  appointmentId: true,
  questionId: true,
  questionKeySnapshot: true,
  questionLabelSnapshot: true,
  questionTypeSnapshot: true,
  answerValue: true,
  createdAt: true,
} satisfies Prisma.AppointmentBookingAnswerSelect;

// MediaAsset is universal polymorphic — owned by tenant/location/service/
// staff/client/appointment/campaign. Reference photos for a booking are
// rows where ownerType='appointment' + appointmentOwnerId matches.
const MEDIA_ASSET_FIELDS = {
  id: true,
  tenantId: true,
  bucket: true,
  objectKey: true,
  accessClass: true,
  ownerType: true,
  appointmentOwnerId: true,
  clientOwnerId: true,
  serviceOwnerId: true,
  noteId: true,
  visibility: true,
  folder: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  durationSeconds: true,
  altText: true,
  variants: true,
  uploadedAt: true,
  createdAt: true,
} satisfies Prisma.MediaAssetSelect;

// ---------- types ----------

export type AppointmentLinkedRecords = {
  appointment: Pick<Appointment, keyof typeof APPOINTMENT_SUMMARY_FIELDS> & {
    client: Pick<Client, keyof typeof CLIENT_SUMMARY_FIELDS>;
    service: Pick<Service, keyof typeof SERVICE_SUMMARY_FIELDS>;
    staff: Pick<Staff, keyof typeof STAFF_SUMMARY_FIELDS>;
  };
  clientAlerts: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  pinnedClientNotes: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  serviceNotes: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  appointmentNotes: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  bookingAnswers: Pick<
    AppointmentBookingAnswer,
    keyof typeof BOOKING_ANSWER_FIELDS
  >[];
  referenceFiles: Pick<MediaAsset, keyof typeof MEDIA_ASSET_FIELDS>[];
  soapNote: Pick<SoapNote, keyof typeof SOAP_NOTE_FIELDS> | null;
};

export type ClientTimelineVisit = {
  appointment: Pick<Appointment, keyof typeof APPOINTMENT_SUMMARY_FIELDS>;
  service: Pick<Service, keyof typeof SERVICE_SUMMARY_FIELDS>;
  staff: Pick<Staff, keyof typeof STAFF_SUMMARY_FIELDS>;
  notes: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  bookingAnswers: Pick<
    AppointmentBookingAnswer,
    keyof typeof BOOKING_ANSWER_FIELDS
  >[];
  files: Pick<MediaAsset, keyof typeof MEDIA_ASSET_FIELDS>[];
  soapNote: Pick<SoapNote, keyof typeof SOAP_NOTE_FIELDS> | null;
};

export type ClientTimelineResponse = {
  client: Pick<Client, keyof typeof CLIENT_SUMMARY_FIELDS>;
  alerts: Pick<ClientNote, keyof typeof NOTE_SUMMARY_FIELDS>[];
  visits: ClientTimelineVisit[];
  total: number;
};

// ---------- linked records (appointment-scoped) ----------

export async function getAppointmentLinkedRecords(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string },
): Promise<AppointmentLinkedRecords | null> {
  const { tenantId, appointmentId } = args;

  // Fetch the appointment + its three direct FKs in one round trip. If the
  // appointment doesn't exist (or is in a different tenant), bail with null
  // — the route maps to 404.
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      ...APPOINTMENT_SUMMARY_FIELDS,
      client: { select: CLIENT_SUMMARY_FIELDS },
      service: { select: SERVICE_SUMMARY_FIELDS },
      staff: { select: STAFF_SUMMARY_FIELDS },
    },
  });
  if (!appointment) return null;

  const { clientId, serviceId } = appointment;

  // Seven queries inside an interactive transaction. Required because
  // Supabase's pgbouncer transaction-mode pool can't share prepared
  // statements across parallel connections (Promise.all outside a tx
  // raises "prepared statement does not exist"; $transaction(array)
  // raises "already exists" on retry). Interactive $transaction(async
  // tx => ...) holds one dedicated connection start-to-end and lets
  // Promise.all on `tx` work — same pattern appointmentService uses
  // (services/appointmentService.ts:153).
  const [
    clientAlerts,
    pinnedClientNotes,
    serviceNotes,
    appointmentNotes,
    bookingAnswers,
    referenceFiles,
    soapNote,
  ] = await prisma.$transaction(async (tx) =>
    Promise.all([
      tx.clientNote.findMany({
        where: {
          tenantId,
          clientId,
          priority: 'alert',
          archivedAt: null,
        },
        select: NOTE_SUMMARY_FIELDS,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      }),
      tx.clientNote.findMany({
        where: {
          tenantId,
          clientId,
          pinned: true,
          archivedAt: null,
          // Exclude alerts already returned above to avoid duplication on
          // the wire.
          priority: { not: 'alert' },
        },
        select: NOTE_SUMMARY_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      tx.clientNote.findMany({
        where: {
          tenantId,
          clientId,
          serviceId,
          // Avoid double-listing notes that are already pinned/alerted.
          archivedAt: null,
          appointmentId: null,
          pinned: false,
          priority: 'normal',
        },
        select: NOTE_SUMMARY_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      tx.clientNote.findMany({
        where: {
          tenantId,
          clientId,
          appointmentId,
          archivedAt: null,
        },
        select: NOTE_SUMMARY_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      tx.appointmentBookingAnswer.findMany({
        where: { tenantId, appointmentId },
        select: BOOKING_ANSWER_FIELDS,
        orderBy: { createdAt: 'asc' },
      }),
      tx.mediaAsset.findMany({
        where: {
          tenantId,
          ownerType: 'appointment',
          appointmentOwnerId: appointmentId,
        },
        select: MEDIA_ASSET_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
      tx.soapNote.findFirst({
        where: { tenantId, appointmentId },
        select: SOAP_NOTE_FIELDS,
        orderBy: { createdAt: 'desc' },
      }),
    ]),
  );

  return {
    appointment,
    clientAlerts,
    pinnedClientNotes,
    serviceNotes,
    appointmentNotes,
    bookingAnswers,
    referenceFiles,
    soapNote,
  };
}

// ---------- client timeline (client-scoped) ----------

export async function getClientTimeline(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    query: ClientTimelineQuery;
  },
): Promise<ClientTimelineResponse | null> {
  const { tenantId, clientId, query } = args;

  // Confirm the client exists in this tenant before doing the (more
  // expensive) follow-up queries. Cheap indexed lookup.
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: CLIENT_SUMMARY_FIELDS,
  });
  if (!client) return null;

  const apptWhere: Prisma.AppointmentWhereInput = {
    tenantId,
    clientId,
  };
  if (query.serviceId) apptWhere.serviceId = query.serviceId;
  if (query.staffId) apptWhere.staffId = query.staffId;

  // Top-level queries batched into one interactive tx for connection
  // stability under the Supabase pooler — see comment in
  // getAppointmentLinkedRecords for the why.
  const { alerts, appointments, total } = await prisma.$transaction(
    async (tx) => {
      const [alertsResult, appointmentsResult, totalResult] = await Promise.all(
        [
          tx.clientNote.findMany({
            where: {
              tenantId,
              clientId,
              priority: 'alert',
              archivedAt: null,
            },
            select: NOTE_SUMMARY_FIELDS,
            orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
          }),
          tx.appointment.findMany({
            where: apptWhere,
            select: {
              ...APPOINTMENT_SUMMARY_FIELDS,
              service: { select: SERVICE_SUMMARY_FIELDS },
              staff: { select: STAFF_SUMMARY_FIELDS },
            },
            orderBy: [{ scheduledStartAt: 'desc' }, { id: 'asc' }],
            take: query.take,
            skip: query.skip,
          }),
          tx.appointment.count({ where: apptWhere }),
        ],
      );
      return {
        alerts: alertsResult,
        appointments: appointmentsResult,
        total: totalResult,
      };
    },
  );

  // Per-visit fan-out — for each appointment in the page, batch its four
  // linked-record queries into one interactive tx. Visits themselves run
  // sequentially (also pooler-safe). Latency is N * (one-tx round-trip)
  // where N is the page size; for take=20 that's well within budget for
  // an admin view.
  const visits: ClientTimelineVisit[] = [];
  for (const appt of appointments) {
    const [notes, bookingAnswers, files, soapNote] = await prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.clientNote.findMany({
            where: {
              tenantId,
              clientId,
              appointmentId: appt.id,
              archivedAt: null,
            },
            select: NOTE_SUMMARY_FIELDS,
            orderBy: { createdAt: 'desc' },
          }),
          tx.appointmentBookingAnswer.findMany({
            where: { tenantId, appointmentId: appt.id },
            select: BOOKING_ANSWER_FIELDS,
            orderBy: { createdAt: 'asc' },
          }),
          tx.mediaAsset.findMany({
            where: {
              tenantId,
              ownerType: 'appointment',
              appointmentOwnerId: appt.id,
            },
            select: MEDIA_ASSET_FIELDS,
            orderBy: { createdAt: 'desc' },
          }),
          tx.soapNote.findFirst({
            where: { tenantId, appointmentId: appt.id },
            select: SOAP_NOTE_FIELDS,
            orderBy: { createdAt: 'desc' },
          }),
        ]),
    );
    const { service, staff, ...appointment } = appt;
    visits.push({
      appointment,
      service,
      staff,
      notes,
      bookingAnswers,
      files,
      soapNote,
    });
  }

  return { client, alerts, visits, total };
}
