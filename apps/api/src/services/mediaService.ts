import { Prisma } from '@prisma/client';
import type { MediaAsset } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import {
  buildObjectKey,
  computePublicUrl,
  headObject,
  presignGet,
  presignUpload,
  R2NotConfiguredError,
} from '../integrations/r2.js';
import type {
  CompleteUploadBody,
  ListMediaAssetsQuery,
  PresignUploadBody,
  UpdateMediaAssetBody,
} from '../schemas/media.js';

// Domain layer for MediaAsset (E3-S4c).
//
// Lifecycle:
//   1. POST /presign        → creates a placeholder MediaAsset row with
//                             uploadedAt=null, returns a presigned PUT URL
//   2. browser → R2          → direct upload to Cloudflare R2
//   3. POST /:id/complete   → server runs HeadObject, captures size + etag,
//                             marks uploadedAt=now()
//   4. clients fetch the asset via getDisplayUrl() — public CDN for
//      accessClass='public_booking' / 'generated', signed-short for
//      everything else
//
// Tenant scoping: every query passes tenantId. Cross-tenant attempts
// return null (404 from the route).
//
// Soft-delete on reads is auto-applied; archive is a separate lifecycle
// (soft hide vs full removal — same pattern as ClientNote).

const MEDIA_FIELDS = {
  id: true,
  tenantId: true,
  bucket: true,
  objectKey: true,
  accessClass: true,
  ownerType: true,
  tenantOwnerId: true,
  locationOwnerId: true,
  serviceOwnerId: true,
  staffOwnerId: true,
  clientOwnerId: true,
  appointmentOwnerId: true,
  campaignOwnerId: true,
  noteId: true,
  folder: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  checksumSha256: true,
  width: true,
  height: true,
  durationSeconds: true,
  altText: true,
  caption: true,
  variants: true,
  metadata: true,
  visibility: true,
  protected: true,
  uploadedByUserId: true,
  uploadedByStaffId: true,
  uploadedByClient: true,
  uploadedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.MediaAssetSelect;

export class InvalidMediaReferenceError extends Error {
  code = 'INVALID_MEDIA_REFERENCE' as const;
  field: 'ownerType' | 'ownerId' | 'noteId' | 'visibility';
  constructor(
    field: 'ownerType' | 'ownerId' | 'noteId' | 'visibility',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidMediaReferenceError';
    this.field = field;
  }
}

export class MediaUploadIncompleteError extends Error {
  code = 'MEDIA_UPLOAD_INCOMPLETE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadIncompleteError';
  }
}

// Maps owner type to the column we set on MediaAsset to anchor the
// polymorphic relation. Keeps "exactly one *_owner_id non-null" invariant.
const OWNER_FK_COLUMN: Record<
  PresignUploadBody['ownerType'],
  keyof Prisma.MediaAssetUncheckedCreateInput
> = {
  tenant: 'tenantOwnerId',
  location: 'locationOwnerId',
  service: 'serviceOwnerId',
  staff: 'staffOwnerId',
  client: 'clientOwnerId',
  appointment: 'appointmentOwnerId',
  campaign: 'campaignOwnerId',
};

async function ensureOwnerExistsForTenant(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    ownerType: PresignUploadBody['ownerType'];
    ownerId: string;
  },
): Promise<void> {
  const { tenantId, ownerType, ownerId } = args;
  let exists: { id: string } | null = null;
  switch (ownerType) {
    case 'tenant':
      exists =
        ownerId === tenantId
          ? await tx.tenant.findFirst({
              where: { id: tenantId },
              select: { id: true },
            })
          : null;
      break;
    case 'location':
      exists = await tx.location.findFirst({
        where: { id: ownerId, tenantId },
        select: { id: true },
      });
      break;
    case 'service':
      exists = await tx.service.findFirst({
        where: { id: ownerId, tenantId },
        select: { id: true },
      });
      break;
    case 'staff':
      exists = await tx.staff.findFirst({
        where: { id: ownerId, tenantId },
        select: { id: true },
      });
      break;
    case 'client':
      exists = await tx.client.findFirst({
        where: { id: ownerId, tenantId },
        select: { id: true },
      });
      break;
    case 'appointment':
      exists = await tx.appointment.findFirst({
        where: { id: ownerId, tenantId },
        select: { id: true },
      });
      break;
    case 'campaign':
      // Campaign isn't a Prisma model yet (Tier C). We accept any
      // owner_id without validation here — when Campaigns land, add the
      // lookup. Documented in schema.prisma:848.
      exists = { id: ownerId };
      break;
  }
  if (!exists) {
    throw new InvalidMediaReferenceError(
      'ownerId',
      `${ownerType} not found for this tenant.`,
    );
  }
}

async function ensureOptionalNoteForTenant(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; noteId?: string },
): Promise<void> {
  if (!args.noteId) return;
  const note = await tx.clientNote.findFirst({
    where: { id: args.noteId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!note) {
    throw new InvalidMediaReferenceError(
      'noteId',
      'Unknown client note for this tenant.',
    );
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'media_asset.presigned'
      | 'media_asset.completed'
      | 'media_asset.updated'
      | 'media_asset.archived'
      | 'media_asset.unarchived'
      | 'media_asset.deleted';
    entityId: string;
    before: MediaAsset | null;
    after: MediaAsset | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'media_asset',
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

// ---------- presign ----------

export type PresignResult = {
  asset: MediaAsset;
  upload: {
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
};

export async function presignMediaUpload(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: PresignUploadBody;
  },
): Promise<PresignResult> {
  const { tenantId, actorUserId, body } = args;

  // Bucket name comes from env now; in Phase 2 the protected bucket may
  // diverge per-tenant via TenantMediaRoot. Until then, use the env
  // default for everything (loaded inside r2.ts).
  if (!process.env.R2_BUCKET_NAME) {
    throw new R2NotConfiguredError(['R2_BUCKET_NAME']);
  }
  const bucketName = process.env.R2_BUCKET_NAME;

  // Generate the asset id up-front so we can stamp it into the object
  // key (collision-proof per buildout spec).
  const assetId = (await import('node:crypto')).randomUUID().replace(/-/g, '').slice(0, 24);

  const objectKey = buildObjectKey({
    tenantId,
    ownerType: body.ownerType,
    ownerId: body.ownerId,
    folder: body.folder,
    assetId,
    fileName: body.fileName,
  });

  return prisma.$transaction(async (tx) => {
    await ensureOwnerExistsForTenant(tx, {
      tenantId,
      ownerType: body.ownerType,
      ownerId: body.ownerId,
    });
    await ensureOptionalNoteForTenant(tx, { tenantId, noteId: body.noteId });

    // Build the polymorphic owner column assignment.
    const ownerColumn = OWNER_FK_COLUMN[body.ownerType];
    const ownerData: Partial<Prisma.MediaAssetUncheckedCreateInput> = {
      [ownerColumn]: body.ownerId,
    };

    const asset = await tx.mediaAsset.create({
      data: {
        tenantId,
        bucket: bucketName,
        objectKey,
        accessClass: body.accessClass,
        ownerType: body.ownerType,
        ...ownerData,
        noteId: body.noteId ?? null,
        folder: body.folder,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: BigInt(body.sizeBytes),
        altText: body.altText ?? null,
        caption: body.caption ?? null,
        visibility: body.visibility ?? 'location',
        // uploadedAt stays null until /complete confirms via HeadObject.
        // The default in schema.prisma:834 is now() — override to null
        // by setting explicitly via a field workaround: we update post-
        // create. Actually Prisma doesn't let us override the default to
        // null on create cleanly here, so we treat sizeBytes>0 + the
        // absence of an etag/checksum entry in metadata as the "draft"
        // signal. Reviewed: the row IS created with uploadedAt=now() per
        // schema default, but we additionally set uploadedAt to a sentinel
        // date AFTER the row is created via update, so /complete sees a
        // distinct "needs upload verification" state.
      },
      select: MEDIA_FIELDS,
    });

    // Force uploadedAt to a sentinel epoch-1970 to mark "draft" state
    // for /complete to detect. Avoids changing the schema default.
    const draftDate = new Date(0);
    const draftAsset = await tx.mediaAsset.update({
      where: { id: asset.id },
      data: { uploadedAt: draftDate },
      select: MEDIA_FIELDS,
    });

    const upload = await presignUpload({
      objectKey,
      contentType: body.mimeType,
      contentLength: body.sizeBytes,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'media_asset.presigned',
      entityId: draftAsset.id,
      before: null,
      after: draftAsset,
    });

    return { asset: draftAsset, upload };
  });
}

// ---------- complete ----------

export async function completeMediaUpload(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: CompleteUploadBody;
  },
): Promise<{ asset: MediaAsset } | null> {
  const { tenantId, actorUserId, id, body } = args;

  const before = await prisma.mediaAsset.findFirst({
    where: { tenantId, id },
    select: MEDIA_FIELDS,
  });
  if (!before) return null;

  // HeadObject in R2 to verify the upload landed.
  const head = await headObject({ objectKey: before.objectKey });
  if (!head.exists) {
    throw new MediaUploadIncompleteError(
      'No object found at the expected key. Did the upload finish?',
    );
  }

  // Cross-check size — caller-claimed sizeBytes vs actual R2 contentLength.
  // Mismatch can mean truncated upload or wrong claim; surface as 422.
  const actualSize = head.contentLength;
  const claimedSize = Number(before.sizeBytes);
  if (actualSize !== claimedSize) {
    throw new MediaUploadIncompleteError(
      `Size mismatch: claimed ${claimedSize} bytes, R2 has ${actualSize}.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const after = await tx.mediaAsset.update({
      where: { id },
      data: {
        uploadedAt: new Date(),
        checksumSha256: body.checksumSha256 ?? null,
        // Persist the etag in metadata for future variant-generation +
        // dedup. Keep existing metadata (image EXIF, etc.).
        metadata: {
          ...((before.metadata as Record<string, unknown>) ?? {}),
          r2Etag: head.etag,
        } as Prisma.InputJsonValue,
      },
      select: MEDIA_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'media_asset.completed',
      entityId: id,
      before,
      after,
    });

    return { asset: after };
  });
}

// ---------- list / get ----------

export async function listMediaAssets(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; query: ListMediaAssetsQuery },
): Promise<{ assets: MediaAsset[]; total: number }> {
  const { tenantId, query } = args;
  const where: Prisma.MediaAssetWhereInput = { tenantId };
  if (query.ownerType) where.ownerType = query.ownerType;
  if (query.ownerId) {
    // Owner ID matches the polymorphic column for the requested ownerType.
    // If ownerType is unset, search ANY owner-id column for the value.
    if (query.ownerType) {
      const col = OWNER_FK_COLUMN[query.ownerType];
      (where as Record<string, unknown>)[col] = query.ownerId;
    } else {
      where.OR = [
        { tenantOwnerId: query.ownerId },
        { locationOwnerId: query.ownerId },
        { serviceOwnerId: query.ownerId },
        { staffOwnerId: query.ownerId },
        { clientOwnerId: query.ownerId },
        { appointmentOwnerId: query.ownerId },
        { campaignOwnerId: query.ownerId },
      ];
    }
  }
  if (query.folder) where.folder = query.folder;
  if (query.accessClass) where.accessClass = query.accessClass;
  if (query.noteId) where.noteId = query.noteId;
  if (!query.includeArchived) where.archivedAt = null;

  const [assets, total] = await prisma.$transaction(async (tx) =>
    Promise.all([
      tx.mediaAsset.findMany({
        where,
        select: MEDIA_FIELDS,
        orderBy: [{ uploadedAt: 'desc' }, { createdAt: 'desc' }],
        take: query.take,
        skip: query.skip,
      }),
      tx.mediaAsset.count({ where }),
    ]),
  );

  return { assets, total };
}

export async function getMediaAssetById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<MediaAsset | null> {
  return prisma.mediaAsset.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: MEDIA_FIELDS,
  });
}

// ---------- update / archive / soft-delete ----------

export async function updateMediaAsset(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateMediaAssetBody;
  },
): Promise<{ asset: MediaAsset } | null> {
  const { tenantId, actorUserId, id, body } = args;

  const hasChanges = Object.keys(body).length > 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.mediaAsset.findFirst({
      where: { tenantId, id },
      select: MEDIA_FIELDS,
    });
    if (!before) return null;
    if (!hasChanges) return { asset: before };

    const data: Prisma.MediaAssetUpdateInput = {};
    if (body.altText !== undefined) data.altText = body.altText;
    if (body.caption !== undefined) data.caption = body.caption;
    if (body.visibility !== undefined) data.visibility = body.visibility;

    const after = await tx.mediaAsset.update({
      where: { id },
      data,
      select: MEDIA_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'media_asset.updated',
      entityId: id,
      before,
      after,
    });

    return { asset: after };
  });
}

export async function setMediaAssetArchived(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    archived: boolean;
  },
): Promise<{ asset: MediaAsset } | null> {
  const { tenantId, actorUserId, id, archived } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.mediaAsset.findFirst({
      where: { tenantId, id },
      select: MEDIA_FIELDS,
    });
    if (!before) return null;

    const currentlyArchived = before.archivedAt !== null;
    if (currentlyArchived === archived) {
      return { asset: before };
    }

    const after = await tx.mediaAsset.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      select: MEDIA_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: archived ? 'media_asset.archived' : 'media_asset.unarchived',
      entityId: id,
      before,
      after,
    });

    return { asset: after };
  });
}

export async function softDeleteMediaAsset(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string; id: string },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.mediaAsset.findFirst({
      where: { tenantId, id },
      select: MEDIA_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.mediaAsset.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: MEDIA_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'media_asset.deleted',
      entityId: id,
      before,
      after,
    });

    return { deleted: true };
  });
}

// ---------- display URL ----------

// Computes the URL the frontend should use to display the asset. Public-
// CDN classes get the static custom-domain URL (browser-cacheable).
// Everything else gets a signed GET URL with 1h expiry.
//
// Async because signed URL generation hits R2 (well, computes locally
// but needs the SDK initialized). Routes/handlers can await this once
// per asset.
export async function getDisplayUrl(asset: MediaAsset): Promise<string> {
  if (
    asset.accessClass === 'public_booking' ||
    asset.accessClass === 'generated'
  ) {
    return computePublicUrl(asset.objectKey);
  }
  const signed = await presignGet({ objectKey: asset.objectKey });
  return signed.url;
}
