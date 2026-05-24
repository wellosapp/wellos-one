'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  completeMediaUpload,
  presignMediaUpload,
  type PresignResult,
} from '@/lib/api/media';
import {
  updateTenantBrand,
  type BrandColor,
} from '@/lib/api/tenant-brand';
import { getWhoami } from '@/lib/api/whoami';

// Server actions for Brand Settings:
//   - updateBrandColorsAction (Phase 1) — palette save
//   - presignTenantLogoUploadAction (Phase 2) — start an R2 upload for the logo
//   - completeTenantLogoUploadAction (Phase 2) — finalize after PUT
//   - setTenantLogoAction (Phase 2) — attach/clear the FK on Tenant

export type BrandSettingsActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type LogoPresignResult =
  | { ok: true; data: PresignResult }
  | { ok: false; error: string };

export type LogoCompleteResult =
  | { ok: true; assetId: string }
  | { ok: false; error: string };

export type LogoSetResult = { ok: boolean; error?: string };

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

// Phase 1 — brand palette save.
// The editor serializes its full color array into a single hidden
// `brandColorsJson` form field; this action parses + forwards to the API.
export async function updateBrandColorsAction(
  _prev: BrandSettingsActionState,
  formData: FormData,
): Promise<BrandSettingsActionState> {
  const raw = formData.get('brandColorsJson');
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Missing brandColorsJson payload.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON payload.' };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'brandColors must be an array.' };
  }
  // Trust the client-side validation + backend's Zod schema to catch any
  // remaining issues. Coerce shape only.
  const brandColors: BrandColor[] = parsed.map((c) => ({
    name: String((c as { name: unknown }).name ?? '').trim(),
    hex: String((c as { hex: unknown }).hex ?? '').trim().toUpperCase(),
  }));

  try {
    await updateTenantBrand({ brandColors });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return {
          ok: false,
          error: 'You must be an admin to update brand settings.',
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Could not save brand palette.' };
  }

  revalidatePath('/admin/settings/branding');
  revalidatePath('/admin/services/new');
  // Other service pages will revalidate naturally on next visit.
  return { ok: true };
}

// Phase 2 — logo upload pipeline.
//
// Presign requires { ownerType: 'tenant', ownerId: <tenantId> }. We resolve
// the tenantId via /admin/whoami so the action stays self-contained. The
// backend additionally enforces tenant scoping via requireRole + the asset's
// tenantId column.
export async function presignTenantLogoUploadAction(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<LogoPresignResult> {
  try {
    const me = await getWhoami();
    const tenantId = me.tenant?.id ?? me.user.tenantId;
    if (!tenantId) {
      return {
        ok: false,
        error: 'No tenant linked to your account. Contact an admin.',
      };
    }
    const data = await presignMediaUpload({
      ownerType: 'tenant',
      ownerId: tenantId,
      folder: 'tenant-brand',
      // Logo eventually shows on the public booking page; mark public-class
      // from the start to avoid a future migration.
      accessClass: 'public_booking',
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not start upload.') };
  }
}

export async function completeTenantLogoUploadAction(
  assetId: string,
): Promise<LogoCompleteResult> {
  try {
    await completeMediaUpload(assetId, {});
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Could not complete upload.') };
  }
  return { ok: true, assetId };
}

// Attaches (string) or clears (null) the tenant's logo FK. Revalidates the
// branding page AND the admin shell paths so the rail picks up the change.
export async function setTenantLogoAction(
  mediaAssetId: string | null,
): Promise<LogoSetResult> {
  try {
    await updateTenantBrand({ logoMediaAssetId: mediaAssetId });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return {
          ok: false,
          error: 'You must be an admin to update brand settings.',
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Could not update tenant logo.' };
  }
  revalidatePath('/admin/settings/branding');
  // The rail lives in /admin/layout — revalidate the layout's path. Layout
  // re-renders on every admin route on next nav, but explicit hint helps.
  revalidatePath('/admin', 'layout');
  return { ok: true };
}
