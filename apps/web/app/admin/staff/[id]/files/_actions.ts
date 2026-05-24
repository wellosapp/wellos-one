'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  archiveMediaAsset,
  completeMediaUpload,
  deleteMediaAsset,
  getMediaAsset,
  presignMediaUpload,
  type CompleteUploadBody,
  type MediaAssetDetailResponse,
  type PresignResult,
  type PresignUploadBody,
} from '@/lib/api/media';

// Server actions for the staff profile Files section. Tenant scoping +
// admin-only DELETE enforcement happen at the Fastify API.

export type FilesActionState = {
  ok: boolean;
  error?: string;
};

export type FilesPresignResult =
  | { ok: true; data: PresignResult }
  | { ok: false; error: string };

export type FilesCompleteResult =
  | { ok: true; assetId: string }
  | { ok: false; error: string };

export type FilesSignedUrlResult =
  | { ok: true; data: MediaAssetDetailResponse }
  | { ok: false; error: string };

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

// Presign a PUT URL for direct R2 upload. The body shape is fixed to
// `ownerType: 'staff'` to enforce this surface stays within the staff
// profile boundary.
export async function presignFileUploadAction(
  staffId: string,
  body: Omit<PresignUploadBody, 'ownerType' | 'ownerId'>,
): Promise<FilesPresignResult> {
  try {
    const data = await presignMediaUpload({
      ...body,
      ownerType: 'staff',
      ownerId: staffId,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not start upload.') };
  }
}

export async function completeFileUploadAction(
  staffId: string,
  assetId: string,
  body: CompleteUploadBody = {},
): Promise<FilesCompleteResult> {
  try {
    await completeMediaUpload(assetId, body);
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not complete upload.') };
  }
  revalidatePath(`/admin/staff/${staffId}/files`);
  return { ok: true, assetId };
}

export async function deleteFileAction(
  staffId: string,
  assetId: string,
): Promise<FilesActionState> {
  try {
    await deleteMediaAsset(assetId);
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not delete file.') };
  }
  revalidatePath(`/admin/staff/${staffId}/files`);
  return { ok: true };
}

export async function archiveFileAction(
  staffId: string,
  assetId: string,
): Promise<FilesActionState> {
  try {
    await archiveMediaAsset(assetId);
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not archive file.') };
  }
  revalidatePath(`/admin/staff/${staffId}/files`);
  return { ok: true };
}

// Used by the FilesGrid to fetch a signed displayUrl on demand (e.g. when
// opening a preview). The list endpoint doesn't include it.
export async function getFileDisplayUrlAction(
  assetId: string,
): Promise<FilesSignedUrlResult> {
  try {
    const data = await getMediaAsset(assetId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not load file.') };
  }
}
