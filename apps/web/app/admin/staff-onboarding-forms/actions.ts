'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import {
  createStaffOnboardingFormDefinition,
  publishStaffOnboardingFormDefinition,
  updateStaffOnboardingFormDefinition,
} from '@/lib/api/staff-onboarding-forms';

export type StaffOnboardingFormEditorState = {
  ok: boolean;
  error?: string;
};

export async function createBlankStaffOnboardingFormAction(): Promise<void> {
  try {
    const { definition } = await createStaffOnboardingFormDefinition({
      title: 'New staff onboarding form',
      schema: [],
    });
    revalidatePath('/admin/staff-onboarding-forms');
    redirect(`/admin/staff-onboarding-forms/${definition.id}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    const message =
      err instanceof ApiError ? err.message : 'Could not create form.';
    throw new Error(message);
  }
}

export async function saveStaffOnboardingFormDefinitionAction(
  _prev: StaffOnboardingFormEditorState,
  formData: FormData,
): Promise<StaffOnboardingFormEditorState> {
  const id = formData.get('id');
  const title = formData.get('title');
  const schemaRaw = formData.get('schemaJson');
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, error: 'Missing form id.' };
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, error: 'Title is required.' };
  }
  if (typeof schemaRaw !== 'string') {
    return { ok: false, error: 'Schema JSON is required.' };
  }
  let schema: unknown;
  try {
    schema = JSON.parse(schemaRaw) as unknown;
  } catch {
    return { ok: false, error: 'Schema must be valid JSON.' };
  }
  if (!Array.isArray(schema)) {
    return { ok: false, error: 'Schema must be a JSON array of fields.' };
  }

  try {
    await updateStaffOnboardingFormDefinition(id, {
      title: title.trim(),
      schema,
    });
    revalidatePath('/admin/staff-onboarding-forms');
    revalidatePath(`/admin/staff-onboarding-forms/${id}`);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Could not save form.';
    return { ok: false, error: message };
  }
}

export async function publishStaffOnboardingFormDefinitionAction(
  id: string,
): Promise<StaffOnboardingFormEditorState> {
  try {
    await publishStaffOnboardingFormDefinition(id);
    revalidatePath('/admin/staff-onboarding-forms');
    revalidatePath(`/admin/staff-onboarding-forms/${id}`);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Could not publish form.';
    return { ok: false, error: message };
  }
}
