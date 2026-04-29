import { z } from 'zod';

// Zod schemas for the Staff admin CRUD surface. Mirrors the shape of
// schemas/service.ts. Per docs/09-dev-handoff.md "Epic 2":
//   - firstName required; lastName/email/phone all optional
//   - email/phone are NOT unique at DB level; no duplicate-warning surface
//     (unlike Client) — two staff with the same email is a config error
//     the admin resolves directly, not a typical real-world case
//   - workingHours is JSONB with day-of-week → shifts shape
//   - hourly rate stored in cents; commission as percent (0-100, 2 decimals)
//   - serviceIds array on create/update assigns the M2M join in one save

const TRIM_NONEMPTY = z.string().trim().min(1);
const OPTIONAL_TRIM_NONEMPTY = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined));

const EMAIL = z.string().trim().email().max(254).optional()
  .or(z.literal('').transform(() => undefined));

const PHONE = z.string().trim().min(3).max(40).optional()
  .or(z.literal('').transform(() => undefined));

// Time-of-day in 24h "HH:MM" format. Booking engine assumes 24h grid.
const TIME_HHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format');

const ShiftSchema = z
  .object({
    start: TIME_HHMM,
    end: TIME_HHMM,
  })
  .refine((s) => s.start < s.end, {
    message: 'Shift end must be after start',
    path: ['end'],
  });

// Day-of-week → optional array of shifts. Missing key OR empty array
// means "closed". MVP: typical case is single shift per day; multi-shift
// (split shift) is supported in the data shape but UI defers it.
const WORKING_HOURS = z
  .object({
    mon: z.array(ShiftSchema).optional(),
    tue: z.array(ShiftSchema).optional(),
    wed: z.array(ShiftSchema).optional(),
    thu: z.array(ShiftSchema).optional(),
    fri: z.array(ShiftSchema).optional(),
    sat: z.array(ShiftSchema).optional(),
    sun: z.array(ShiftSchema).optional(),
  })
  .strict()
  .optional();

// Commission rate is a percentage 0-100 with two decimals (DB column is
// Decimal(5, 2)). Sent as a number from the client; stored in DB as Decimal.
const COMMISSION_RATE_PCT = z
  .number()
  .min(0)
  .max(100)
  // Round to 2 decimals to match the DB column. Avoids "0.001" sneaking in
  // and silently truncating server-side.
  .transform((n) => Math.round(n * 100) / 100)
  .optional();

// Hourly rate in cents. Cap at $1000/hr (100_000 cents) — rejects typos
// without limiting any real wellness/salon job.
const HOURLY_RATE_CENTS = z.number().int().min(0).max(100_000).optional();

// Service IDs to assign to this staff member (StaffService M2M). Inline
// on create/update so the assignment is atomic with the staff write.
// Cap at 200 — any tenant assigning a single staffer to >200 services has
// a data model problem.
const SERVICE_IDS = z.array(z.string().min(1)).max(200).optional();

export const CreateStaffBodySchema = z.object({
  firstName: TRIM_NONEMPTY.max(80),
  lastName: z.string().trim().max(80).optional()
    .or(z.literal('').transform(() => undefined)),
  email: EMAIL,
  phone: PHONE,
  jobTitle: OPTIONAL_TRIM_NONEMPTY.pipe(z.string().max(120)).optional(),
  workingHours: WORKING_HOURS,
  hourlyRateCents: HOURLY_RATE_CENTS,
  commissionRatePct: COMMISSION_RATE_PCT,
  active: z.boolean().optional(),
  serviceIds: SERVICE_IDS,
});
export type CreateStaffBody = z.infer<typeof CreateStaffBodySchema>;

// PATCH: every field optional. Empty body is a no-op at the service layer.
// Note: serviceIds present (even if []) means "replace assignments with
// this list". Absent means "leave assignments untouched".
export const UpdateStaffBodySchema = CreateStaffBodySchema.partial();
export type UpdateStaffBody = z.infer<typeof UpdateStaffBodySchema>;

// Same query-bool helpers as schemas/service.ts. Local until a third
// schema makes it worth hoisting.
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

const QueryBoolFilter = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    return v === true || v === 'true' || v === '1';
  });

// GET /admin/staff query params. All optional.
//   q              — substring search across firstName, lastName, email, phone, jobTitle
//   active         — filter to active or inactive only (undefined = no filter)
//   take / skip    — offset pagination
//   includeDeleted — admin-only opt-in to surface soft-deleted staff
export const ListStaffQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  active: QueryBoolFilter,
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
});
export type ListStaffQuery = z.infer<typeof ListStaffQuerySchema>;

export const StaffIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type StaffIdParams = z.infer<typeof StaffIdParamsSchema>;
