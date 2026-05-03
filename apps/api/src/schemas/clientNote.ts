import { z } from 'zod';

// Zod schemas for the ClientNote admin CRUD surface (E3-S4a).
//
// Field rules per docs/SESSION-HANDOFF-2026-04-30-evening.md (Tier-A) +
// mindbody-rebuild-master-spec.md §5.2.2 (client memory) +
// docs/04-booking UI UX Update/wellos-booking-ui-walkthrough-v2-notes.md.
//
// Identity rules:
//   - clientId comes from the URL path, never the body
//   - tenantId comes from request.currentUser, never the body
//   - authorType + author*Id derived server-side from request.currentUser; the
//     ClientNote.author* fields are not client-controlled

const TRIM_NONEMPTY = z.string().trim().min(1);
const ISO_DATETIME = z.string().datetime({ offset: true });

// Mirrors ClientNoteCategory enum in schema.prisma:67-80.
export const ClientNoteCategorySchema = z.enum([
  'general',
  'preference',
  'formula',
  'allergy',
  'medical',
  'clinical',
  'behavioral',
  'billing',
  'relationship',
  'internal',
  'session',
  'customer_request',
]);
export type ClientNoteCategoryInput = z.infer<typeof ClientNoteCategorySchema>;

// Mirrors ClientNotePriority. Two-state on purpose — escalation isn't graded.
export const ClientNotePrioritySchema = z.enum(['normal', 'alert']);
export type ClientNotePriorityInput = z.infer<typeof ClientNotePrioritySchema>;

// Mirrors ClientNoteSourceSurface. Caller stamps where the note originated.
// `system_transition` is reserved for system-authored rows; rejected at the
// service layer for non-admin callers.
export const ClientNoteSourceSurfaceSchema = z.enum([
  'public_booking',
  'magic_link_manage',
  'appointment_detail',
  'calendar_drawer',
  'quick_book',
  'client_profile',
  'intake_form',
  'system_transition',
]);
export type ClientNoteSourceSurfaceInput = z.infer<
  typeof ClientNoteSourceSurfaceSchema
>;

// Mirrors ClientNoteVisibility. Note: `customer_submitted` is not creatable
// from the admin surface — it's a public-booking artifact (E3-S4d). Rejected
// at the service layer with a field-style error.
export const ClientNoteVisibilitySchema = z.enum([
  'location',
  'provider_only',
  'admin_only',
  'customer_submitted',
  'protected_clinical',
]);
export type ClientNoteVisibilityInput = z.infer<
  typeof ClientNoteVisibilitySchema
>;

// Mirrors ClientNoteAlertTrigger (Postgres enum array). Empty list means the
// note never auto-fires — caller can still pin it.
export const ClientNoteAlertTriggerSchema = z.enum([
  'booking',
  'check_in',
  'checkout',
]);
export type ClientNoteAlertTriggerInput = z.infer<
  typeof ClientNoteAlertTriggerSchema
>;

// Mirrors ClientNoteAckTriggerContext.
export const ClientNoteAckTriggerContextSchema = z.enum([
  'booking',
  'check_in',
  'checkout',
  'manual',
]);
export type ClientNoteAckTriggerContextInput = z.infer<
  typeof ClientNoteAckTriggerContextSchema
>;

// Body cap matches Client.notes; titles cap shorter — they should be glanceable.
const BODY = z.string().trim().min(1).max(8000);
const TITLE = z
  .string()
  .trim()
  .max(200)
  .optional()
  .or(z.literal('').transform(() => undefined));

// Matches schemas/appointment.ts pattern. Empty string from a form field
// becomes undefined.
const OPTIONAL_FK = z
  .string()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined));

// Alert trigger array. Default empty so callers can omit the field entirely.
const ALERT_TRIGGERS = z
  .array(ClientNoteAlertTriggerSchema)
  .max(3)
  .optional()
  .transform((v) => v ?? []);

// POST /admin/clients/:clientId/notes
export const CreateClientNoteBodySchema = z.object({
  category: ClientNoteCategorySchema,
  priority: ClientNotePrioritySchema.optional(),
  title: TITLE,
  body: BODY,
  appointmentId: OPTIONAL_FK,
  serviceId: OPTIONAL_FK,
  sourceSurface: ClientNoteSourceSurfaceSchema,
  visibility: ClientNoteVisibilitySchema,
  customerVisible: z.boolean().optional(),
  alertTriggers: ALERT_TRIGGERS,
  pinned: z.boolean().optional(),
  expiresAt: ISO_DATETIME.optional(),
});
export type CreateClientNoteBody = z.infer<typeof CreateClientNoteBodySchema>;

// PATCH /admin/clients/:clientId/notes/:noteId
//   - clientId / tenantId / author* are not editable
//   - pinned / archivedAt are only mutable via dedicated POST endpoints
//     (pin/unpin/archive/unarchive) so audit_log entries stay clean
export const UpdateClientNoteBodySchema = z
  .object({
    category: ClientNoteCategorySchema.optional(),
    priority: ClientNotePrioritySchema.optional(),
    title: TITLE,
    body: BODY.optional(),
    visibility: ClientNoteVisibilitySchema.optional(),
    customerVisible: z.boolean().optional(),
    alertTriggers: ALERT_TRIGGERS,
    expiresAt: ISO_DATETIME.nullable().optional(),
    appointmentId: OPTIONAL_FK,
    serviceId: OPTIONAL_FK,
  })
  .strict();
export type UpdateClientNoteBody = z.infer<typeof UpdateClientNoteBodySchema>;

// Same query-bool helper as schemas/appointment.ts. Local to avoid premature
// shared-helper extraction; hoist when a fourth schema needs them.
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

// GET /admin/clients/:clientId/notes — filters
//   archived defaults to false (matches Prisma extension's deletedAt: null
//   default — both auto-applied filters narrow to "live, visible" notes).
//   includeArchived flips that to surface archived rows.
export const ListClientNotesQuerySchema = z.object({
  category: ClientNoteCategorySchema.optional(),
  priority: ClientNotePrioritySchema.optional(),
  visibility: ClientNoteVisibilitySchema.optional(),
  appointmentId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
  pinned: QueryBoolFlag,
  includeArchived: QueryBoolFlag,
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListClientNotesQuery = z.infer<typeof ListClientNotesQuerySchema>;

// URL params. Two flavors — one for the parent client only, one for note id.
export const ClientIdParamsSchema = z.object({
  clientId: z.string().min(1),
});
export type ClientIdParams = z.infer<typeof ClientIdParamsSchema>;

export const ClientNoteIdParamsSchema = z.object({
  clientId: z.string().min(1),
  noteId: z.string().min(1),
});
export type ClientNoteIdParams = z.infer<typeof ClientNoteIdParamsSchema>;

// POST /admin/clients/:clientId/notes/:noteId/acknowledge
//   staffId is explicit because Staff has no userId link in the schema yet;
//   the frontend resolves "current user → staff record" itself. Tracked as a
//   known gap in the S4a PR description.
export const AcknowledgeClientNoteBodySchema = z.object({
  staffId: TRIM_NONEMPTY,
  triggerContext: ClientNoteAckTriggerContextSchema,
  appointmentId: OPTIONAL_FK,
});
export type AcknowledgeClientNoteBody = z.infer<
  typeof AcknowledgeClientNoteBodySchema
>;
