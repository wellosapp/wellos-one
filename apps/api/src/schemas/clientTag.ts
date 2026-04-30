import { z } from 'zod';

// Zod schemas for the ClientTag admin CRUD surface. Mirrors schemas/service.ts.
// Per docs/09-dev-handoff.md "Epic 2": tags on Client are a separate table
// with a M2M join. This file owns the tag-side CRUD; the M2M assignment lives
// inline on Client create/update via tagIds[] (see schemas/client.ts).
//
// Field rules:
//   - name required (max 80); per-tenant unique on (tenantId, name) at the DB.
//   - color optional, 6-digit hex; UI maps to design tokens.
//   - No `active` flag — tags don't have one in the schema.

const TRIM_NONEMPTY = z.string().trim().min(1);

const HEX_COLOR = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use 6-digit hex like #3D7A5E')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CreateClientTagBodySchema = z.object({
  name: TRIM_NONEMPTY.max(80),
  color: HEX_COLOR,
});
export type CreateClientTagBody = z.infer<typeof CreateClientTagBodySchema>;

// PATCH: every field optional. Empty body is allowed but no-ops at the
// service layer (returns the existing row unchanged).
export const UpdateClientTagBodySchema = CreateClientTagBodySchema.partial();
export type UpdateClientTagBody = z.infer<typeof UpdateClientTagBodySchema>;

// Same shape as schemas/service.ts -- see comments there for why we don't
// use z.coerce.boolean() (it returns true for the literal string "false").
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

// GET /admin/client-tags query params. All optional.
//   q              — substring search on name (case-insensitive)
//   take / skip    — offset pagination; cap take to prevent abuse
//   includeDeleted — admin-only opt-in to surface soft-deleted tags
export const ListClientTagsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
});
export type ListClientTagsQuery = z.infer<typeof ListClientTagsQuerySchema>;

export const ClientTagIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ClientTagIdParams = z.infer<typeof ClientTagIdParamsSchema>;
