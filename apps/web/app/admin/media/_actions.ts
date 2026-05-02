'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  archiveMediaAsset,
  completeMediaUpload,
  deleteMediaAsset,
  presignMediaUpload,
  unarchiveMediaAsset,
  updateMediaAsset,
  type CompleteUploadBody,
  type MediaAssetVisibility,
  type PresignResult,
  type PresignUploadBody,
  type R2NotConfiguredBody,
} from '@/lib/api/media';

// Server actions for the admin Media Manager. The presign + complete
// helpers proxy through Server Actions so the Clerk Bearer is attached
// server-side (the file PUT itself is browser→R2 directly using the
// presigned URL — that doesn't need Clerk).

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  // R2-not-configured surface — the UI renders a polished alert when
  // this is set so the operator knows where to look (Cloudflare dashboard
  // + .env / Railway).
  r2NotConfigured?: { missing: string[] };
};

const PAGE = '/admin/media';

function apiErrorToState(err: ApiError): ActionState {
  if (err.status === 503 && err.body && typeof err.body === 'object' && 'missing' in err.body) {
    const body = err.body as R2NotConfiguredBody;
    return {
      ok: false,
      error: body.message,
      r2NotConfigured: { missing: body.missing ?? [] },
    };
  }
  if (err.status === 400 && err.body && typeof err.body === 'object' && 'issues' in err.body) {
    const issues = (err.body as { issues: Array<{ path: string; message: string }> }).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }
  if (err.status === 403) {
    return { ok: false, error: 'You do not have admin access for this action.' };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Media asset not found.' };
  }
  return { ok: false, error: err.message };
}

// ---- Lifecycle (archive / unarchive / delete / patch) ----

export async function archiveMediaAssetAction(
  id: string,
): Promise<ActionState> {
  try {
    await archiveMediaAsset(id);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function unarchiveMediaAssetAction(
  id: string,
): Promise<ActionState> {
  try {
    await unarchiveMediaAsset(id);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function deleteMediaAssetAction(
  id: string,
): Promise<ActionState> {
  try {
    await deleteMediaAsset(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else if (err instanceof ApiError) {
      return apiErrorToState(err);
    } else {
      throw err;
    }
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function updateMediaAssetAction(
  id: string,
  body: {
    altText?: string | null;
    caption?: string | null;
    visibility?: MediaAssetVisibility;
  },
): Promise<ActionState> {
  try {
    await updateMediaAsset(id, body);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Upload (presign + complete proxies) ----
// The browser PUT to R2 happens between these two calls — we don't proxy
// the file through the Next server.

export type PresignActionResult =
  | { ok: true; result: PresignResult }
  | { ok: false; error: string; r2NotConfigured?: { missing: string[] } };

export async function presignMediaUploadAction(
  body: PresignUploadBody,
): Promise<PresignActionResult> {
  try {
    const result = await presignMediaUpload(body);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiError) {
      const state = apiErrorToState(err);
      return {
        ok: false,
        error: state.error ?? 'Presign failed.',
        r2NotConfigured: state.r2NotConfigured,
      };
    }
    throw err;
  }
}

export type CompleteActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completeMediaUploadAction(
  id: string,
  body: CompleteUploadBody = {},
): Promise<CompleteActionResult> {
  try {
    await completeMediaUpload(id, body);
  } catch (err) {
    if (err instanceof ApiError) {
      const state = apiErrorToState(err);
      return { ok: false, error: state.error ?? 'Complete failed.' };
    }
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}
