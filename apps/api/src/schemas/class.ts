import { z } from 'zod';

// Zod schemas for the Class admin CRUD surface. Phase 1 of the Classes
// epic — TEMPLATE only. Mirrors schemas/service.ts shape with capacity
// additions (max/min capacity, waitlist). Per-occurrence (ClassInstance),
// bookings, and check-in are Phase 2-4.
//
// Length / range caps are upper bounds to prevent abuse, not UX guidance.

const TRIM_NONEMPTY = z.string().trim().min(1);

const HEX_COLOR = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use 6-digit hex like #3D7A5E')
  .optional()
  .or(z.literal('').transform(() => undefined));

// Class durations cap at 12h — anything longer is a workshop or retreat,
// not a single class slot. Capacity cap at 500 is a sanity bound (largest
// real-world studio session we expect to see; raise if a customer needs it).
const DURATION_MINUTES = z.number().int().min(5).max(720);
const BASE_PRICE_CENTS = z.number().int().min(0).max(10_000_000);
const CAPACITY = z.number().int().min(1).max(500);
const MIN_TO_RUN = z.number().int().min(1).max(500);
const WAITLIST_LIMIT = z.number().int().min(0).max(500);
const BUFFER_MINUTES = z.number().int().min(0).max(240);

const OPTIONAL_CATEGORY_ID = z
  .union([
    z.string().trim().min(1),
    z.literal('').transform(() => undefined),
  ])
  .optional();

// Instructor staff IDs (ClassInstructor M2M). Cap at 50 — realistic upper
// bound for a single class template's instructor pool.
const INSTRUCTOR_IDS = z.array(z.string().min(1)).max(50).optional();

export const CreateClassBodySchema = z
  .object({
    name: TRIM_NONEMPTY.max(120),
    shortDescription: z
      .string()
      .max(280)
      .optional()
      .or(z.literal('').transform(() => undefined))
      .nullable(),
    longDescription: z
      .string()
      .max(5000)
      .optional()
      .or(z.literal('').transform(() => undefined))
      .nullable(),
    durationMinutes: DURATION_MINUTES,
    basePriceCents: BASE_PRICE_CENTS.optional(),
    maxCapacity: CAPACITY,
    minToRun: MIN_TO_RUN.optional(),
    allowWaitlist: z.boolean().optional(),
    waitlistLimit: WAITLIST_LIMIT.optional(),
    color: HEX_COLOR,
    bufferBeforeMinutes: BUFFER_MINUTES.optional(),
    bufferAfterMinutes: BUFFER_MINUTES.optional(),
    active: z.boolean().optional(),
    categoryId: OPTIONAL_CATEGORY_ID,
    instructorIds: INSTRUCTOR_IDS,
  })
  .refine(
    (b) => (b.minToRun ?? 1) <= b.maxCapacity,
    {
      message: 'minToRun cannot exceed maxCapacity',
      path: ['minToRun'],
    },
  );
export type CreateClassBody = z.infer<typeof CreateClassBodySchema>;

// PATCH: every field optional. Empty body is allowed but no-ops at the
// service layer. categoryId may be null to clear the FK.
export const UpdateClassBodySchema = z
  .object({
    name: TRIM_NONEMPTY.max(120).optional(),
    shortDescription: z
      .string()
      .max(280)
      .optional()
      .or(z.literal('').transform(() => undefined))
      .nullable(),
    longDescription: z
      .string()
      .max(5000)
      .optional()
      .or(z.literal('').transform(() => undefined))
      .nullable(),
    durationMinutes: DURATION_MINUTES.optional(),
    basePriceCents: BASE_PRICE_CENTS.optional(),
    maxCapacity: CAPACITY.optional(),
    minToRun: MIN_TO_RUN.optional(),
    allowWaitlist: z.boolean().optional(),
    waitlistLimit: WAITLIST_LIMIT.optional(),
    color: HEX_COLOR,
    bufferBeforeMinutes: BUFFER_MINUTES.optional(),
    bufferAfterMinutes: BUFFER_MINUTES.optional(),
    active: z.boolean().optional(),
    categoryId: z
      .union([
        z.string().trim().min(1),
        z.literal('').transform(() => null),
        z.null(),
      ])
      .optional(),
    instructorIds: INSTRUCTOR_IDS,
  })
  .refine(
    (b) =>
      b.minToRun === undefined ||
      b.maxCapacity === undefined ||
      b.minToRun <= b.maxCapacity,
    {
      message: 'minToRun cannot exceed maxCapacity',
      path: ['minToRun'],
    },
  );
export type UpdateClassBody = z.infer<typeof UpdateClassBodySchema>;

// Same query-bool helpers as schemas/service.ts. Hoist when a third schema needs them.
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

// GET /admin/classes query params. All optional.
//   q              — substring search on name/description (case-insensitive)
//   active         — filter to active or inactive only (undefined = no filter)
//   categoryId     — narrow to a category
//   take / skip    — offset pagination; cap take so a malicious caller can't
//                    request 10k rows in one shot
//   includeDeleted — admin-only opt-in to surface soft-deleted classes
export const ListClassesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  active: QueryBoolFilter,
  categoryId: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
});
export type ListClassesQuery = z.infer<typeof ListClassesQuerySchema>;

export const ClassIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ClassIdParams = z.infer<typeof ClassIdParamsSchema>;
