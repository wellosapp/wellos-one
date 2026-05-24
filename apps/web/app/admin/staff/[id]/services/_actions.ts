'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { updateStaff } from '@/lib/api/staff';

// Dedicated server action for the staff services picker. Only updates
// the staff_services M2M assignments — all other staff fields are left
// untouched by sending a partial PATCH with just `serviceIds`.

export type ServicesActionState = {
  ok: boolean;
  error?: string;
};

export async function updateStaffServicesAction(
  staffId: string,
  _prev: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const serviceIds = formData
    .getAll('serviceIds')
    .filter((v): v is string => typeof v === 'string');

  try {
    await updateStaff(staffId, { serviceIds });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return {
          ok: false,
          error: 'You do not have permission to update staff services.',
        };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Could not save service assignments.' };
  }

  revalidatePath(`/admin/staff/${staffId}/services`);
  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true };
}
