// Type-safe wrappers for /admin/media endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/media.ts and the service-layer projection in
// mediaService.ts. Kept in sync by hand at MVP.

import { apiFetch } from './client';

// ---- Enums (mirror apps/api/src/schemas/media.ts) ----

export type MediaOwnerType =
  | 'tenant'
  | 'location'
  | 'service'
  | 'staff'
  | 'client'
  | 'appointment'
  | 'campaign';

export type MediaAccessClass =
  | 'public_booking'
  | 'tenant_staff'
  | 'client_owned'
  | 'protected_medspa'
  | 'generated';

export type MediaAssetVisibility =
  | 'location'
  | 'provider_only'
  | 'admin_only';

// ---- Asset shape (mirror MEDIA_FIELDS in apps/api/src/services/mediaService.ts) ----

export type MediaAsset = {
  id: string;
  tenantId: string;
  bucket: string;
  objectKey: string;
  accessClass: MediaAccessClass;
  ownerType: MediaOwnerType;
  tenantOwnerId: string | null;
  locationOwnerId: string | null;
  serviceOwnerId: string | null;
  staffOwnerId: string | null;
  clientOwnerId: string | null;
  appointmentOwnerId: string | null;
  campaignOwnerId: string | null;
  noteId: string | null;
  folder: string;
  fileName: string;
  mimeType: string;
  // BigInt serialized as string by Prisma over the wire — coerce on the
  // consumer side via Number() if needed.
  sizeBytes: string | number;
  checksumSha256: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string | null;
  caption: string | null;
  variants: unknown;
  metadata: unknown;
  visibility: MediaAssetVisibility;
  protected: boolean;
  uploadedByUserId: string | null;
  uploadedByStaffId: string | null;
  uploadedByClient: boolean;
  uploadedAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// ---- List ----

export type ListMediaAssetsQuery = {
  ownerType?: MediaOwnerType;
  ownerId?: string;
  folder?: string;
  accessClass?: MediaAccessClass;
  noteId?: string;
  includeArchived?: boolean;
  take?: number;
  skip?: number;
};

export type ListMediaAssetsResponse = {
  assets: MediaAsset[];
  total: number;
};

export async function listMediaAssets(
  query: ListMediaAssetsQuery = {},
): Promise<ListMediaAssetsResponse> {
  return apiFetch<ListMediaAssetsResponse>('/admin/media', {
    searchParams: {
      ownerType: query.ownerType,
      ownerId: query.ownerId,
      folder: query.folder,
      accessClass: query.accessClass,
      noteId: query.noteId,
      includeArchived: query.includeArchived,
      take: query.take,
      skip: query.skip,
    },
  });
}

// ---- Detail (with computed displayUrl) ----

export type MediaAssetDetailResponse = {
  asset: MediaAsset;
  // null if R2 isn't configured — the row still exists, just no URL.
  displayUrl: string | null;
};

export async function getMediaAsset(
  id: string,
): Promise<MediaAssetDetailResponse> {
  return apiFetch<MediaAssetDetailResponse>(`/admin/media/${id}`);
}

// ---- Update (caption / altText / visibility only) ----

export type UpdateMediaAssetBody = {
  altText?: string | null;
  caption?: string | null;
  visibility?: MediaAssetVisibility;
};

export async function updateMediaAsset(
  id: string,
  body: UpdateMediaAssetBody,
): Promise<{ asset: MediaAsset }> {
  return apiFetch(`/admin/media/${id}`, { method: 'PATCH', body });
}

// ---- Archive / Unarchive (idempotent toggles) ----

export async function archiveMediaAsset(
  id: string,
): Promise<{ asset: MediaAsset }> {
  return apiFetch(`/admin/media/${id}/archive`, { method: 'POST' });
}

export async function unarchiveMediaAsset(
  id: string,
): Promise<{ asset: MediaAsset }> {
  return apiFetch(`/admin/media/${id}/unarchive`, { method: 'POST' });
}

// ---- Soft delete (admin-only) ----

export async function deleteMediaAsset(id: string): Promise<void> {
  await apiFetch(`/admin/media/${id}`, { method: 'DELETE' });
}

// ---- Appointment-scoped list (E3-S6) ----
// Groups media linked to an appointment into the 5 buckets the calendar
// drawer's Files tab renders. Categorization rules live server-side
// (see mediaService.categorizeAppointmentMedia) — folder-prefix-based
// with `accessClass=generated` taking precedence.

export type AppointmentMediaResponse = {
  referencePhotos: MediaAsset[];
  intakeDocs: MediaAsset[];
  consentDocs: MediaAsset[];
  receipts: MediaAsset[];
  generated: MediaAsset[];
};

export async function getAppointmentMedia(
  appointmentId: string,
): Promise<AppointmentMediaResponse> {
  return apiFetch<AppointmentMediaResponse>(
    `/admin/appointments/${appointmentId}/media`,
  );
}

// ---- Presign + complete (upload flow) ----

export type PresignUploadBody = {
  ownerType: MediaOwnerType;
  ownerId: string;
  folder: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  accessClass: MediaAccessClass;
  visibility?: MediaAssetVisibility;
  noteId?: string;
  altText?: string;
  caption?: string;
};

export type PresignResult = {
  asset: MediaAsset;
  upload: {
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
};

export async function presignMediaUpload(
  body: PresignUploadBody,
): Promise<PresignResult> {
  return apiFetch('/admin/media/presign', { method: 'POST', body });
}

export type CompleteUploadBody = {
  checksumSha256?: string;
};

export async function completeMediaUpload(
  id: string,
  body: CompleteUploadBody = {},
): Promise<{ asset: MediaAsset }> {
  return apiFetch(`/admin/media/${id}/complete`, { method: 'POST', body });
}

// ---- 503 (R2 not configured) body shape ----
// Surfaces from any of: presign, complete, get-with-displayUrl. Other
// endpoints work without R2.
export type R2NotConfiguredBody = {
  error: 'Service Unavailable';
  message: string;
  missing: string[];
};
