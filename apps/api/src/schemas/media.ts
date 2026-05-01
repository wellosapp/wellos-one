import { z } from 'zod';

// Zod schemas for the media-asset admin endpoints (E3-S4c).
//
// Per docs/04-booking UI UX Update/wellos_booking_r2_uiux_package/
// wellos_calendar_booking_r2_uiux_buildout.md §2.5-2.6 and the
// "Admin Media Manager UX" reference image.

const TRIM_NONEMPTY = z.string().trim().min(1);

// Mirrors MediaOwnerType (schema.prisma:145).
export const MediaOwnerTypeSchema = z.enum([
  'tenant',
  'location',
  'service',
  'staff',
  'client',
  'appointment',
  'campaign',
]);
export type MediaOwnerTypeInput = z.infer<typeof MediaOwnerTypeSchema>;

// Mirrors MediaAccessClass (schema.prisma:134). Drives URL generation
// (public CDN vs signed-and-short-lived) and which bucket the object
// lives in (today both classes share one bucket; protected_medspa moves
// to a separate bucket in Phase 2).
export const MediaAccessClassSchema = z.enum([
  'public_booking',
  'tenant_staff',
  'client_owned',
  'protected_medspa',
  'generated',
]);
export type MediaAccessClassInput = z.infer<typeof MediaAccessClassSchema>;

// Mirrors MediaAssetVisibility — controls who within the tenant can SEE
// the asset (separate from accessClass which controls how it's served).
export const MediaAssetVisibilitySchema = z.enum([
  'location',
  'provider_only',
  'admin_only',
]);
export type MediaAssetVisibilityInput = z.infer<
  typeof MediaAssetVisibilitySchema
>;

// File name + folder are constrained to keep R2 keys predictable.
// Folder taxonomy is free-form per tenant (matches the schema comment),
// but we still apply common-sense limits.
const FOLDER = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9\-_/]*$/,
    "Folder must be lowercase alphanumerics with - _ / only (e.g. 'gallery', 'docs/prep')",
  );

const FILE_NAME = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/\.[a-zA-Z0-9]+$/, 'File name must include a recognizable extension');

// Cap upload size at 100 MB at the API layer. Larger uploads should use
// multipart and a different code path (deferred to S4c v2).
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SIZE_BYTES = z.number().int().positive().max(MAX_UPLOAD_BYTES);

const MIME_TYPE = z
  .string()
  .trim()
  .min(3)
  .max(127)
  .regex(/^[a-zA-Z0-9!#$&^_+\-.]+\/[a-zA-Z0-9!#$&^_+\-.]+$/);

// POST /admin/media/presign
//
// Caller supplies the *intent* of the upload: who owns it, what folder,
// what file. Server picks the R2 object key, creates a placeholder
// MediaAsset row (uploadedAt=null until /complete), returns a presigned
// PUT URL valid for ~10 min.
export const PresignUploadBodySchema = z.object({
  ownerType: MediaOwnerTypeSchema,
  // Owner ID matches the foreign key for the corresponding ownerType.
  // For ownerType='tenant', use the caller's tenantId.
  ownerId: TRIM_NONEMPTY,
  folder: FOLDER,
  fileName: FILE_NAME,
  mimeType: MIME_TYPE,
  sizeBytes: SIZE_BYTES,
  accessClass: MediaAccessClassSchema,
  visibility: MediaAssetVisibilitySchema.optional(),
  // Optional link to a ClientNote that "carries" this attachment.
  noteId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  altText: z
    .string()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  caption: z
    .string()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type PresignUploadBody = z.infer<typeof PresignUploadBodySchema>;

// POST /admin/media/:id/complete
//
// Frontend confirms the upload finished. Server runs HeadObject to
// verify the file actually arrived, captures size + etag, and marks
// the asset uploaded.
export const CompleteUploadBodySchema = z
  .object({
    // Optional — caller can compute sha256 client-side and we'll persist
    // it for integrity checks. R2 doesn't natively expose sha256 (only
    // etag/md5), so this is a soft verification.
    checksumSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'sha256 must be 64-char lowercase hex')
      .optional(),
  })
  .strict();
export type CompleteUploadBody = z.infer<typeof CompleteUploadBodySchema>;

// PATCH /admin/media/:id — limited subset. ownerType / ownerId / folder /
// objectKey are immutable (changing any of them would orphan the R2
// object). Use /replace for swapping the underlying file (S4c v2).
export const UpdateMediaAssetBodySchema = z
  .object({
    altText: z.string().max(500).nullable().optional(),
    caption: z.string().max(1000).nullable().optional(),
    visibility: MediaAssetVisibilitySchema.optional(),
  })
  .strict();
export type UpdateMediaAssetBody = z.infer<typeof UpdateMediaAssetBodySchema>;

// GET /admin/media — list with optional filters. Always tenant-scoped.
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

export const ListMediaAssetsQuerySchema = z.object({
  ownerType: MediaOwnerTypeSchema.optional(),
  ownerId: z.string().min(1).optional(),
  folder: z.string().min(1).optional(),
  accessClass: MediaAccessClassSchema.optional(),
  noteId: z.string().min(1).optional(),
  // archived defaults to false (matches ClientNote pattern). includeArchived
  // surfaces archived rows (typically only used by an admin "trash" view).
  includeArchived: QueryBoolFlag,
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListMediaAssetsQuery = z.infer<
  typeof ListMediaAssetsQuerySchema
>;

export const MediaAssetIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type MediaAssetIdParams = z.infer<typeof MediaAssetIdParamsSchema>;
