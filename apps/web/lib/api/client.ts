import { auth } from '@clerk/nextjs/server';

// Server-side fetch wrapper for the Wellos API (api.wellos.one). Attaches
// the caller's Clerk session token as a Bearer header so the Fastify backend
// can run loadCurrentUser + requireRole.
//
// Use from server components, route handlers, and server actions ONLY.
// The Clerk session token is short-lived and request-scoped; do not pass
// it to the client.
//
// On non-2xx responses, throws ApiError with the parsed body (if JSON) so
// callers can branch on status (e.g. 404 → "not found UI", 400 → show
// validation issues, 403 → "you're not admin"). Network failures throw
// the underlying TypeError unchanged.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
  /** Extra headers (e.g. x-wellos-calendar-drag for reschedule analytics). */
  headers?: Record<string, string>;
  // Cache strategy. Default 'no-store' for admin reads (always fresh) — admin
  // surfaces shouldn't show stale data. Pass 'force-cache' or a revalidate
  // tag if a specific call is OK with caching.
  cache?: RequestCache;
  // Optional Next.js revalidate tag for selective invalidation.
  next?: { revalidate?: number; tags?: string[] };
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    searchParams,
    cache = 'no-store',
    next,
    headers: extraHeaders,
  } = options;
  const { getToken } = await auth();
  const token = await getToken();

  const url = new URL(path.startsWith('/') ? path : `/${path}`, API_BASE_URL);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache,
      next,
    });
  } catch (cause) {
    const msg =
      cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `API fetch failed: ${method} ${url.href} (${msg}). ` +
        `Set NEXT_PUBLIC_API_URL to your Fastify base (e.g. http://127.0.0.1:3001 for local) and ensure the API process is running.`,
      { cause },
    );
  }

  // 204 No Content → no body
  if (res.status === 204) {
    return undefined as T;
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
        : `API ${method} ${path} failed with status ${res.status}`;
    throw new ApiError(res.status, parsed, message);
  }

  return parsed as T;
}
