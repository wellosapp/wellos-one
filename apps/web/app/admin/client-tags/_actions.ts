'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createClientTag,
  deleteClientTag,
  updateClientTag,
  type ClientTagWriteBody,
} from '@/lib/api/client-tags';
import { ApiError } from '@/lib/api/client';

// Server actions for admin ClientTag CRUD. Mirrors services/_actions.ts.
// Tags are simpler than Service: just name + color, no money conversion,
// no M2M to manage from this side (clients are assigned from the Client
// form's tag picker).
//
// Tenant scoping + role enforcement happens at the Fastify API.

export type ClientTagFormValues = {
  name?: string;
  color?: string;
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: ClientTagFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function valuesFromForm(formData: FormData): ClientTagFormValues {
  return {
    name: pick(formData, 'name'),
    color: pick(formData, 'color'),
  };
}

function parseBody(values: ClientTagFormValues): {
  body?: ClientTagWriteBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  if (!values.name) fieldErrors.name = 'Name is required.';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    body: {
      name: values.name!,
      color: values.color,
    },
  };
}

function apiErrorToState(
  err: ApiError,
  values: ClientTagFormValues,
): ActionState {
  if (
    err.status === 400 &&
    err.body &&
    typeof err.body === 'object' &&
    'issues' in err.body
  ) {
    const issues = (err.body as { issues: Array<{ path: string; message: string }> })
      .issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
    }
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors,
      values,
    };
  }
  if (err.status === 403) {
    return {
      ok: false,
      error: 'You do not have admin access to this tenant.',
      values,
    };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Tag not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createClientTagAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  let result;
  try {
    result = await createClientTag(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/client-tags');
  // Tag changes affect the picker on the Client form too.
  revalidatePath('/admin/clients');
  redirect(`/admin/client-tags/${result.tag.id}`);
}

export async function updateClientTagAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await updateClientTag(id, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/client-tags');
  revalidatePath(`/admin/client-tags/${id}`);
  // Color/name change ripples to client list badges and the picker.
  revalidatePath('/admin/clients');
  return { ok: true, values };
}

export async function deleteClientTagAction(id: string): Promise<void> {
  try {
    await deleteClientTag(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/client-tags');
  revalidatePath('/admin/clients');
  redirect('/admin/client-tags');
}
