/**
 * Target contract for staff booking CRM context (spec: docs/staff-booking-client-crm.md).
 * Wire to GET /admin/.../staff-booking/client-context (exact path TBD on Fastify).
 *
 * Not used at runtime until the API exists — types prevent drift between web and API.
 */

export type StaffBookingClientStatus =
  | 'active'
  | 'inactive'
  | 'banned'
  | 'deceased'
  | 'vip'
  | 'high_touch'
  | 'needs_admin_approval';

export type StaffBookingAlertTrigger = 'booking' | 'check_in' | 'checkout';

export type StaffBookingBookingAlert = {
  id: string;
  category: string;
  title: string;
  body: string;
  requiresAcknowledgment: boolean;
  trigger: StaffBookingAlertTrigger;
};

export type StaffBookingSnapshot = {
  lastVisitAt: string | null;
  totalVisits: number;
  lifetimeValueCents: number;
  preferredStaffMemberId: string | null;
};

export type StaffBookingRecentVisit = {
  appointmentId: string;
  scheduledStartAt: string;
  serviceName: string | null;
  staffName: string | null;
  state: string;
  notesSnippet: string | null;
  amountPaidCents: number | null;
};

export type StaffBookingFormChipStatus =
  | 'pending'
  | 'sent'
  | 'completed'
  | 'expired'
  | 'required_before_visit'
  | 'required_before_booking';

export type StaffBookingFormSummary = {
  id: string;
  label: string;
  status: StaffBookingFormChipStatus;
};

export type StaffBookingFileSummary = {
  id: string;
  label: string;
  kind: 'image' | 'pdf' | 'other';
  thumbUrl?: string | null;
};

export type StaffBookingPaymentsContext = {
  hasSavedPaymentMethod: boolean;
  /** True ledger balance when payment capture exists; until then often 0. */
  outstandingBalanceCents: number;
  /**
   * Sum of list prices (`bookedBasePriceCents`) for this client's non-terminal
   * appointments with `scheduledStartAt >= now` — committed schedule value.
   */
  upcomingCommittedValueCents: number;
};

export type StaffBookingCustomRow = {
  key: string;
  label: string;
  value: string | null;
  requiredForBooking: boolean;
};

export type StaffBookingClientContextClient = {
  id: string;
  displayName: string;
  preferredName: string | null;
  phone: string | null;
  email: string | null;
  status: StaffBookingClientStatus;
  tags: string[];
  /** Epic 8 notification gates — surfaced at booking per staff-booking-client-crm §5 / §8. */
  smsOptedOut: boolean;
  emailOptedOut: boolean;
  preferredChannel: string | null;
};

export type StaffBookingClientContextResponse = {
  client: StaffBookingClientContextClient;
  snapshot: StaffBookingSnapshot;
  alerts: StaffBookingBookingAlert[];
  pinnedNotes: StaffBookingBookingAlert[];
  recentVisits: StaffBookingRecentVisit[];
  forms: StaffBookingFormSummary[];
  files: StaffBookingFileSummary[];
  payments: StaffBookingPaymentsContext;
  customRows: StaffBookingCustomRow[];
};

/** Alerts and pinned notes that must be explicitly acknowledged before booking (deduped by id). */
export function staffBookingItemsRequiringAcknowledgment(
  context: StaffBookingClientContextResponse,
): StaffBookingBookingAlert[] {
  const seen = new Set<string>();
  const out: StaffBookingBookingAlert[] = [];
  for (const a of [...context.alerts, ...context.pinnedNotes]) {
    if (!a.requiresAcknowledgment) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}
