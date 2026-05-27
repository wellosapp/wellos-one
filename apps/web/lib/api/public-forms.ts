// Public-forms API wrapper for PR 7 of the Forms System epic.
//
// Distinct from apiFetch (which attaches a Clerk session token) — the
// public form completion flow is unauthenticated; the magic-link token
// in the URL IS the auth. These helpers hit /public/forms/:token/* and
// surface ApiError on non-2xx so the caller can map server-side codes
// (TOKEN_EXPIRED, SUBMISSION_CANCELLED, VALIDATION_FAILED, ...) to
// human-readable UI.

import { ApiError } from './errors';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

export interface PublicFormSubmissionDto {
  id: string;
  status: string;
  answers: Record<string, unknown>;
  expiresAt: string | null;
  submittedAt: string | null;
  deliveryChannel: string | null;
  updatedAt: string;
}

export interface PublicFormDefinitionDto {
  id: string;
  title: string;
  description: string | null;
  schema: unknown;
  formType: string | null;
  version: number;
}

export interface PublicFormClientDto {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
}

export interface PublicFormData {
  submission: PublicFormSubmissionDto;
  definition: PublicFormDefinitionDto;
  client: PublicFormClientDto | null;
  tenantName: string;
}

export interface AutosaveResponse {
  submission: {
    id: string;
    status: string;
    updatedAt: string;
  };
}

export interface SubmitResponse {
  submission: {
    id: string;
    status: string;
    submittedAt: string | null;
  };
  confirmation: {
    formTitle: string;
    clientFirstName: string | null;
  };
}

export interface SignatureData {
  imageBase64?: string;
  typedSignature?: string;
}

async function publicFetch<T>(
  path: string,
  init: RequestInit = {},
  cache: RequestCache = 'no-store',
): Promise<T> {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, API_BASE_URL);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Public form API fetch failed: ${url.href} (${msg})`, {
      cause,
    });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Public form API request failed with status ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }
  return parsed as T;
}

export async function getPublicForm(token: string): Promise<PublicFormData> {
  return publicFetch<PublicFormData>(`/public/forms/${token}`);
}

export async function autosavePublicForm(
  token: string,
  answers: Record<string, unknown>,
): Promise<AutosaveResponse> {
  return publicFetch<AutosaveResponse>(`/public/forms/${token}/autosave`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  });
}

export async function submitPublicForm(
  token: string,
  body: { answers: Record<string, unknown>; signatureData?: SignatureData | null },
  idempotencyKey: string,
): Promise<SubmitResponse> {
  return publicFetch<SubmitResponse>(`/public/forms/${token}/submit`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

// File upload — multipart POST. Returns 503 (with code FILE_UPLOAD_DISABLED)
// while the FORMS_FILE_UPLOAD_ENABLED env flag is off. The caller should
// catch ApiError(503) and render the placeholder rather than fail the flow.
export async function uploadPublicFormFile(
  token: string,
  fieldKey: string,
  file: File,
): Promise<{
  mediaAssetId: string;
  fieldKey: string;
  signedUrl: string;
  fileName: string;
  sizeBytes: number;
}> {
  const url = new URL(
    `/public/forms/${token}/files`,
    API_BASE_URL,
  );
  const form = new FormData();
  form.append('fieldKey', fieldKey);
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Public form upload failed: ${url.href} (${msg})`, {
      cause,
    });
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Upload failed with status ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }
  return parsed as {
    mediaAssetId: string;
    fieldKey: string;
    signedUrl: string;
    fileName: string;
    sizeBytes: number;
  };
}
