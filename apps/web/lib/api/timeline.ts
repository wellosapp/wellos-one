// Type-safe wrapper for /admin/clients/:clientId/timeline. Mirrors the
// response shape from apps/api/src/services/linkedRecordsService.ts
// (E3-S4b). Kept in sync by hand — when packages/shared fills in, move.

import { apiFetch } from './client';

// ---------- ClientNote (subset matching NOTE_SUMMARY_FIELDS) ----------

export type NoteCategory =
  | 'general'
  | 'preference'
  | 'formula'
  | 'allergy'
  | 'medical'
  | 'clinical'
  | 'behavioral'
  | 'billing'
  | 'relationship'
  | 'internal'
  | 'session'
  | 'customer_request';

export type NotePriority = 'normal' | 'alert';

export type NoteVisibility =
  | 'location'
  | 'provider_only'
  | 'admin_only'
  | 'customer_submitted'
  | 'protected_clinical';

export type NoteAuthorType = 'customer' | 'staff' | 'admin' | 'system';

export type NoteSourceSurface =
  | 'public_booking'
  | 'magic_link_manage'
  | 'appointment_detail'
  | 'calendar_drawer'
  | 'client_profile'
  | 'intake_form'
  | 'system_transition';

export type NoteAlertTrigger = 'booking' | 'check_in' | 'checkout';

export type ClientNoteSummary = {
  id: string;
  tenantId: string;
  clientId: string;
  category: NoteCategory;
  priority: NotePriority;
  title: string | null;
  body: string;
  appointmentId: string | null;
  serviceId: string | null;
  authorType: NoteAuthorType;
  authorStaffId: string | null;
  authorClientId: string | null;
  authorUserId: string | null;
  sourceSurface: NoteSourceSurface;
  visibility: NoteVisibility;
  customerVisible: boolean;
  alertTriggers: NoteAlertTrigger[];
  pinned: boolean;
  expiresAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------- Visit shapes ----------

export type AppointmentSummary = {
  id: string;
  tenantId: string;
  locationId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  state:
    | 'scheduled'
    | 'confirmed'
    | 'checked_in'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'no_show';
  source:
    | 'web'
    | 'staff'
    | 'widget'
    | 'api'
    | 'import'
    | 'campaign'
    | 'walk_in'
    | 'quick_book';
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type ServiceSummary = {
  id: string;
  name: string;
  durationMinutes: number;
  basePriceCents: number;
  color: string | null;
  active: boolean;
};

export type StaffSummary = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  active: boolean;
};

export type BookingAnswerSummary = {
  id: string;
  appointmentId: string;
  questionId: string;
  questionKeySnapshot: string;
  questionLabelSnapshot: string;
  questionTypeSnapshot:
    | 'chips_single'
    | 'chips_multi'
    | 'short_text'
    | 'long_text'
    | 'slider'
    | 'yes_no'
    | 'photo_upload';
  answerValue: unknown; // JSONB — render based on shape
  createdAt: string;
};

export type MediaAssetSummary = {
  id: string;
  tenantId: string;
  bucket: string;
  objectKey: string;
  accessClass: string;
  ownerType: string;
  appointmentOwnerId: string | null;
  clientOwnerId: string | null;
  serviceOwnerId: string | null;
  noteId: string | null;
  visibility: string;
  folder: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string; // BigInt serialized as string
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string | null;
  variants: unknown;
  uploadedAt: string;
  createdAt: string;
};

export type SoapNoteSummary = {
  id: string;
  tenantId: string;
  appointmentId: string;
  authorStaffId: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  additionalNotes: string | null;
  locked: boolean;
  lockedAt: string | null;
  lockedByStaffId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientTimelineVisit = {
  appointment: AppointmentSummary;
  service: ServiceSummary;
  staff: StaffSummary;
  notes: ClientNoteSummary[];
  bookingAnswers: BookingAnswerSummary[];
  files: MediaAssetSummary[];
  soapNote: SoapNoteSummary | null;
};

export type ClientSummaryShape = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  banned: boolean;
  bannedReason: string | null;
  smsOptedOut: boolean;
  emailOptedOut: boolean;
  preferredChannel: string;
};

export type ClientTimelineResponse = {
  client: ClientSummaryShape;
  alerts: ClientNoteSummary[];
  visits: ClientTimelineVisit[];
  total: number;
};

export type ListClientTimelineQuery = {
  take?: number;
  skip?: number;
  serviceId?: string;
  staffId?: string;
};

export async function getClientTimeline(
  clientId: string,
  query: ListClientTimelineQuery = {},
): Promise<ClientTimelineResponse> {
  return apiFetch<ClientTimelineResponse>(
    `/admin/clients/${clientId}/timeline`,
    {
      searchParams: {
        take: query.take,
        skip: query.skip,
        serviceId: query.serviceId,
        staffId: query.staffId,
      },
    },
  );
}
