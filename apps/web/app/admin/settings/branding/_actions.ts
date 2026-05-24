'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  updateTenantBrand,
  type BrandColor,
} from '@/lib/api/tenant-brand';

// Server action for the Brand Settings palette editor (Phase 1).
// The editor serializes its full color array into a single hidden
// `brandColorsJson` form field; this action parses + forwards to the API.

export type BrandSettingsActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

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
