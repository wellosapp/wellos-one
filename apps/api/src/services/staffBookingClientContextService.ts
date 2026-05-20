import type {
  AppointmentStatus,
  ClientIntakeStatus,
  ClientNoteAlertTrigger,
  ClientNoteCategory,
  ClientNotePriority,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import type { ClientTimelineQuery } from '../schemas/linkedRecords.js';
import type { ClientWithTags } from './clientService.js';
import { getClientById } from './clientService.js';
import type { ClientTimelineVisit } from './linkedRecordsService.js';
import { getClientTimeline } from './linkedRecordsService.js';

/** Mirrors apps/web/lib/staff-booking/client-context-types.ts */
export type StaffBookingAlertTriggerWire = 'booking' | 'check_in' | 'checkout';

export type StaffBookingBookingAlertWire = {
  id: string;
  category: string;
  title: string;
  body: string;
  requiresAcknowledgment: boolean;
  trigger: StaffBookingAlertTriggerWire;
};

export type StaffBookingSnapshotWire = {
  lastVisitAt: string | null;
  totalVisits: number;
  lifetimeValueCents: number;
  preferredStaffMemberId: string | null;
};

export type StaffBookingRecentVisitWire = {
  appointmentId: string;
  scheduledStartAt: string;
  serviceName: string | null;
  staffName: string | null;
  state: string;
  notesSnippet: string | null;
  amountPaidCents: number | null;
};

export type StaffBookingFormSummaryWire = {
  id: string;
  label: string;
  status:
    | 'pending'
    | 'sent'
    | 'completed'
    | 'expired'
    | 'required_before_visit'
    | 'required_before_booking';
};

export type StaffBookingFileSummaryWire = {
  id: string;
  label: string;
  kind: 'image' | 'pdf' | 'other';
  thumbUrl?: string | null;
};

export type StaffBookingPaymentsContextWire = {
  hasSavedPaymentMethod: boolean;
  outstandingBalanceCents: number;
  upcomingCommittedValueCents: number;
};

export type StaffBookingCustomRowWire = {
  key: string;
  label: string;
  value: string | null;
  requiredForBooking: boolean;
};

export type StaffBookingClientStatusWire =
  | 'active'
  | 'inactive'
  | 'banned'
  | 'deceased'
  | 'vip'
  | 'high_touch'
  | 'needs_admin_approval';

export type StaffBookingClientContextClientWire = {
  id: string;
  displayName: string;
  preferredName: string | null;
  phone: string | null;
  email: string | null;
  status: StaffBookingClientStatusWire;
  tags: string[];
  smsOptedOut: boolean;
  emailOptedOut: boolean;
  preferredChannel: string | null;
};

export type StaffBookingClientContextResponseWire = {
  client: StaffBookingClientContextClientWire;
  snapshot: StaffBookingSnapshotWire;
  alerts: StaffBookingBookingAlertWire[];
  pinnedNotes: StaffBookingBookingAlertWire[];
  recentVisits: StaffBookingRecentVisitWire[];
  forms: StaffBookingFormSummaryWire[];
  files: StaffBookingFileSummaryWire[];
  payments: StaffBookingPaymentsContextWire;
  customRows: StaffBookingCustomRowWire[];
};

const NOTES_SNIPPET_MAX = 160;

function truncateSnippet(body: string): string {
  const t = body.trim();
  if (t.length <= NOTES_SNIPPET_MAX) return t;
  return `${t.slice(0, NOTES_SNIPPET_MAX)}…`;
}

function snippetFromVisitNotes(notes: ClientTimelineVisit['notes']): string | null {
  const first = notes[0];
  if (!first?.body?.trim()) return null;
  return truncateSnippet(first.body);
}

function formatStaffName(staff: ClientTimelineVisit['staff']): string | null {
  const parts = [staff.firstName, staff.lastName].filter(Boolean);
  const s = parts.join(' ').trim();
  return s.length > 0 ? s : null;
}

function pickAlertTrigger(triggers: ClientNoteAlertTrigger[]): StaffBookingAlertTriggerWire {
  if (triggers.includes('booking')) return 'booking';
  if (triggers.includes('check_in')) return 'check_in';
  if (triggers.includes('checkout')) return 'checkout';
  return 'booking';
}

function requiresAcknowledgment(args: {
  priority: ClientNotePriority;
  category: ClientNoteCategory;
}): boolean {
  if (args.priority === 'alert') return true;
  return args.category === 'allergy' || args.category === 'medical';
}

function mapNoteToBookingAlert(note: {
  id: string;
  category: ClientNoteCategory;
  priority: ClientNotePriority;
  title: string | null;
  body: string;
  alertTriggers: ClientNoteAlertTrigger[];
}): StaffBookingBookingAlertWire {
  return {
    id: note.id,
    category: note.category,
    title: note.title?.trim() ?? '',
    body: note.body,
    requiresAcknowledgment: requiresAcknowledgment({
      priority: note.priority,
      category: note.category,
    }),
    trigger: pickAlertTrigger(note.alertTriggers),
  };
}

function mapClientStatus(client: ClientWithTags): StaffBookingClientStatusWire {
  if (client.banned) return 'banned';
  const names = client.tags.map((t) => t.name.toLowerCase());
  if (names.some((n) => n === 'vip' || /\bvip\b/.test(n))) return 'vip';
  if (names.some((n) => n.includes('high touch') || n.includes('high-touch')))
    return 'high_touch';
  return 'active';
}

function displayName(client: ClientWithTags): string {
  const parts = [client.firstName, client.lastName].filter(Boolean);
  const s = parts.join(' ').trim();
  return s.length > 0 ? s : 'Client';
}

function intakeToFormStatus(
  status: ClientIntakeStatus,
): StaffBookingFormSummaryWire['status'] {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'sent':
      return 'sent';
    case 'completed':
      return 'completed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

export async function getStaffBookingClientContext(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    serviceId?: string;
    staffId?: string;
  },
): Promise<StaffBookingClientContextResponseWire | null> {
  const clientRow = await getClientById(prisma, {
    tenantId: args.tenantId,
    id: args.clientId,
  });
  if (!clientRow) return null;

  const query: ClientTimelineQuery = {
    take: 5,
    skip: 0,
    serviceId: args.serviceId,
    staffId: args.staffId,
  };

  const timeline = await getClientTimeline(prisma, {
    tenantId: args.tenantId,
    clientId: args.clientId,
    query,
  });

  const pinnedNotesRaw = await prisma.clientNote.findMany({
    where: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      pinned: true,
      archivedAt: null,
      priority: { not: 'alert' },
    },
    select: {
      id: true,
      category: true,
      priority: true,
      title: true,
      body: true,
      alertTriggers: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const alertsSource = timeline?.alerts ?? [];
  const alerts = alertsSource.map(mapNoteToBookingAlert);
  const pinnedNotes = pinnedNotesRaw.map(mapNoteToBookingAlert);

  const visits = timeline?.visits ?? [];
  const recentVisits: StaffBookingRecentVisitWire[] = visits.map((v) => ({
    appointmentId: v.appointment.id,
    scheduledStartAt: v.appointment.scheduledStartAt.toISOString(),
    serviceName: v.service.name ?? null,
    staffName: formatStaffName(v.staff),
    state: v.appointment.state,
    notesSnippet: snippetFromVisitNotes(v.notes),
    // Until Payment capture rows exist, surface list price at booking (same field as LTV sum).
    amountPaidCents: v.appointment.bookedBasePriceCents,
  }));

  const completedWhere = {
    tenantId: args.tenantId,
    clientId: args.clientId,
    state: 'completed' as const,
    deletedAt: null,
  };

  const now = new Date();
  const upcomingStates: AppointmentStatus[] = [
    'scheduled',
    'confirmed',
    'checked_in',
    'in_progress',
  ];
  const upcomingWhere = {
    tenantId: args.tenantId,
    clientId: args.clientId,
    deletedAt: null,
    state: { in: upcomingStates },
    scheduledStartAt: { gte: now },
  };

  const [ltvAgg, lastCompletedVisit, preferredGroups, completedVisitCount, upcomingAgg] =
    await prisma.$transaction([
      prisma.appointment.aggregate({
        where: completedWhere,
        _sum: { bookedBasePriceCents: true },
      }),
      prisma.appointment.findFirst({
        where: completedWhere,
        orderBy: { scheduledStartAt: 'desc' },
        select: { scheduledStartAt: true },
      }),
      prisma.appointment.groupBy({
        by: ['staffId'],
        where: completedWhere,
        _count: { staffId: true },
        orderBy: { _count: { staffId: 'desc' } },
        take: 1,
      }),
      prisma.appointment.count({ where: completedWhere }),
      prisma.appointment.aggregate({
        where: upcomingWhere,
        _sum: { bookedBasePriceCents: true },
      }),
    ]);

  const lifetimeValueCents = ltvAgg._sum.bookedBasePriceCents ?? 0;
  const upcomingCommittedValueCents =
    upcomingAgg._sum?.bookedBasePriceCents ?? 0;
  const lastVisitAt = lastCompletedVisit?.scheduledStartAt.toISOString() ?? null;
  const preferredStaffMemberId = preferredGroups[0]?.staffId ?? null;

  const forms: StaffBookingFormSummaryWire[] = [
    {
      id: 'client-intake',
      label: 'Client intake',
      status: intakeToFormStatus(clientRow.intakeStatus),
    },
  ];

  if (args.serviceId) {
    const questions = await prisma.serviceBookingQuestion.findMany({
      where: {
        tenantId: args.tenantId,
        serviceId: args.serviceId,
        deletedAt: null,
      },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        questionLabel: true,
        isRequired: true,
      },
    });
    for (const q of questions) {
      forms.push({
        id: q.id,
        label: q.questionLabel,
        status: q.isRequired ? 'required_before_booking' : 'pending',
      });
    }
  }

  const mediaRows = await prisma.mediaAsset.findMany({
    where: {
      tenantId: args.tenantId,
      clientOwnerId: args.clientId,
      deletedAt: null,
      archivedAt: null,
    },
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
    },
  });

  const files: StaffBookingFileSummaryWire[] = mediaRows.map((m) => ({
    id: m.id,
    label: m.fileName,
    kind: m.mimeType.startsWith('image/')
      ? 'image'
      : m.mimeType.includes('pdf')
        ? 'pdf'
        : 'other',
  }));

  return {
    client: {
      id: clientRow.id,
      displayName: displayName(clientRow),
      preferredName: clientRow.preferredName?.trim() || null,
      phone: clientRow.phone,
      email: clientRow.email,
      status: mapClientStatus(clientRow),
      tags: clientRow.tags.map((t) => t.name),
      smsOptedOut: clientRow.smsOptedOut,
      emailOptedOut: clientRow.emailOptedOut,
      preferredChannel: clientRow.preferredChannel?.trim() || null,
    },
    snapshot: {
      lastVisitAt,
      /** Completed appointments only (same basis as lifetime value). */
      totalVisits: completedVisitCount,
      lifetimeValueCents,
      preferredStaffMemberId,
    },
    alerts,
    pinnedNotes,
    recentVisits,
    forms,
    files,
    payments: {
      // Stripe Customer / PaymentMethod storage not wired yet — UI keeps placeholders honest.
      hasSavedPaymentMethod: false,
      outstandingBalanceCents: 0,
      upcomingCommittedValueCents,
    },
    customRows: [],
  };
}

/** Matches web `staffBookingFormsRequiringBookingAck` — API-side compliance checks. */
export function staffBookingFormsRequiringBookingAckWire(
  context: StaffBookingClientContextResponseWire,
): StaffBookingFormSummaryWire[] {
  return context.forms.filter(
    (f) =>
      f.status === 'required_before_booking' ||
      f.status === 'required_before_visit',
  );
}
