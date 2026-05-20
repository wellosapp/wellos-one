'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import {
  createIntakeFormDefinition,
  publishIntakeFormDefinition,
  updateIntakeFormDefinition,
} from '@/lib/api/intake-forms';

export type IntakeFormEditorState = {
  ok: boolean;
  error?: string;
};

export async function createBlankIntakeFormAction(): Promise<void> {
  try {
    const { definition } = await createIntakeFormDefinition({
      title: 'New intake form',
      schema: [],
    });
    revalidatePath('/admin/intake-forms');
    redirect(`/admin/intake-forms/${definition.id}`);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    const message =
      err instanceof ApiError ? err.message : 'Could not create form.';
    throw new Error(message);
  }
}

export async function saveIntakeFormDefinitionAction(
  _prev: IntakeFormEditorState,
  formData: FormData,
): Promise<IntakeFormEditorState> {
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
    await updateIntakeFormDefinition(id, {
      title: title.trim(),
      schema,
    });
    revalidatePath('/admin/intake-forms');
    revalidatePath(`/admin/intake-forms/${id}`);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Could not save form.';
    return { ok: false, error: message };
  }
}

export async function publishIntakeFormDefinitionAction(
  id: string,
): Promise<IntakeFormEditorState> {
  try {
    await publishIntakeFormDefinition(id);
    revalidatePath('/admin/intake-forms');
    revalidatePath(`/admin/intake-forms/${id}`);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Could not publish form.';
    return { ok: false, error: message };
  }
}
