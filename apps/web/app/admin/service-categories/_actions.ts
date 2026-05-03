'use server';

import { revalidatePath } from 'next/cache';

import { createServiceCategory } from '@/lib/api/service-categories';
import { ApiError } from '@/lib/api/client';

export type CategoryInlineState = {
  ok: boolean;
  error?: string;
};

export async function createCategoryInlineAction(
  _prev: CategoryInlineState,
  formData: FormData,
): Promise<CategoryInlineState> {
  const name = formData.get('name');
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, error: 'Name is required.' };
  }

  const orderRaw = formData.get('displayOrder');
  let displayOrder: number | undefined;
  if (typeof orderRaw === 'string' && orderRaw.trim() !== '') {
    const n = Number(orderRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: 'Display order must be a non-negative integer.' };
    }
    displayOrder = n;
  }

  try {
    await createServiceCategory({ name: name.trim(), displayOrder });
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  revalidatePath('/admin/service-categories');
  revalidatePath('/admin/services');
  return { ok: true };
}
