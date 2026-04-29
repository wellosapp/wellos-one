import { z } from 'zod';

// Zod schemas for the Client admin CRUD surface.
//
// Field rules per docs/09-dev-handoff.md "Epic 2":
//   - firstName required; lastName/email/phone all optional
//   - email + phone NOT unique at DB level (UI-level duplicate warning only)
//   - intakeStatus defaults to 'pending' on the DB side
//
// Length caps are upper bounds to prevent abuse, not UX guidance — Postgres
// columns are TEXT/VARCHAR untyped at the DB level, so the API has to
// enforce. Picked generous values that won't surprise an admin entering a
// long note or address.

const TRIM_NONEMPTY = z.string().trim().min(1);
const OPTIONAL_TRIM_NONEMPTY = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined));

// Email is loosely validated. We do not normalize case; admin-entered emails
// preserve casing in case the customer uses a case-sensitive provider (rare
// but harmless to preserve).
const EMAIL = z.string().trim().email().max(254).optional()
  .or(z.literal('').transform(() => undefined));

// Phone format is intentionally loose — international formats vary and
// E.164 normalization is a future cleanup. Only enforce length bounds.
const PHONE = z.string().trim().min(3).max(40).optional()
  .or(z.literal('').transform(() => undefined));

export const ClientIntakeStatusSchema = z.enum([
  'pending',
  'sent',
  'completed',
  'expired',
]);
export type ClientIntakeStatusInput = z.infer<typeof ClientIntakeStatusSchema>;

export const CreateClientBodySchema = z.object({
  firstName: TRIM_NONEMPTY.max(80),
  lastName: z.string().trim().max(80).optional()
    .or(z.literal('').transform(() => undefined)),
  email: EMAIL,
  phone: PHONE,
  // Date-only ISO string; coerced to a JS Date at the service layer.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  addressLine1: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(200)).optional(),
  addressLine2: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(200)).optional(),
  city: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(120)).optional(),
  state: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(80)).optional(),
  postalCode: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(20)).optional(),
  country: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(80)).optional(),
  emergencyContactName: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(120)).optional(),
  emergencyContactPhone: PHONE,
  intakeStatus: ClientIntakeStatusSchema.optional(),
  notes: z.string().max(4000).optional()
    .or(z.literal('').transform(() => undefined)),
});
export type CreateClientBody = z.infer<typeof CreateClientBodySchema>;

// PATCH: every field optional. Empty body is allowed but no-ops at the
// service layer (returns the existing row unchanged).
export const UpdateClientBodySchema = CreateClientBodySchema.partial();
export type UpdateClientBody = z.infer<typeof UpdateClientBodySchema>;

// Query strings only carry strings; `z.coerce.boolean()` is just `Boolean(v)`,
// which returns true for any non-empty string — including the literal "false".
// Parse explicitly so `?includeDeleted=false` round-trips to `false`.
const QueryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

// GET /admin/clients query params. All optional.
//   q              — substring search across firstName, lastName, email, phone
//   intakeStatus   — filter to one status
//   take / skip    — offset pagination; cap take so a malicious caller can't
//                    request 10k rows in one shot
//   includeDeleted — admin-only opt-in to surface soft-deleted clients
export const ListClientsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  intakeStatus: ClientIntakeStatusSchema.optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBool,
});
export type ListClientsQuery = z.infer<typeof ListClientsQuerySchema>;

export const ClientIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ClientIdParams = z.infer<typeof ClientIdParamsSchema>;
