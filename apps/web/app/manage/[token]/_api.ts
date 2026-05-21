/**
 * Server-only wrappers for the public magic-link manage endpoints. Talks to
 * Fastify at API_URL (server-side env, unprefixed) — never imported from a
 * client component.
 *
 * Wire contract: see apps/api/src/routes/public/manage.ts.
 */

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

/** Appointment state values exposed on the manage GET response. The wider
 *  enum lives in the API; we narrow here to keep TS happy without coupling. */
export type ManageAppointmentState =
  | 'requested'
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type ManageAppointmentView = {
  appointment: {
    id: string;
    state: ManageAppointmentState;
    scheduledStartAt: string;
    scheduledEndAt: string;
    service: { name: string; durationMinutes: number };
    staff: { firstName: string };
    client: { firstName: string };
    cancellationDeadline: string;
    cancellationFeeCents: number;
  };
  token: { expiresAt: string };
  rescheduleAllowed: boolean;
  cancelAllowed: boolean;
};

/** Discriminated error envelope returned by the API for the public surface. */
export type ManageApiErrorCode =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'REVOKED'
  | 'PURPOSE_MISMATCH'
  | 'APPOINTMENT_NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'RESCHEDULE_NOT_ALLOWED'
  | 'SLOT_CONFLICT'
  | 'STAFF_SCHEDULE_BLOCK_CONFLICT'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class ManageApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ManageApiErrorCode,
    message: string,
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'ManageApiError';
  }
}

function classifyError(
  status: number,
  body: { code?: string; message?: string } | null,
): ManageApiError {
  const raw = body?.code ?? '';
  const known: ManageApiErrorCode[] = [
    'NOT_FOUND',
    'EXPIRED',
    'REVOKED',
    'PURPOSE_MISMATCH',
    'APPOINTMENT_NOT_FOUND',
    'INVALID_STATE_TRANSITION',
    'RESCHEDULE_NOT_ALLOWED',
    'SLOT_CONFLICT',
    'STAFF_SCHEDULE_BLOCK_CONFLICT',
  ];
  const code: ManageApiErrorCode =
    (known as string[]).includes(raw)
      ? (raw as ManageApiErrorCode)
      : status === 404
        ? 'NOT_FOUND'
        : status === 410
          ? 'EXPIRED'
          : status === 400
            ? 'VALIDATION_ERROR'
            : 'UNKNOWN';
  const message =
    typeof body?.message === 'string' && body.message
      ? body.message
      : `Manage API error ${status}`;
  return new ManageApiError(status, code, message, body);
}

function buildUrl(path: string): URL {
  return new URL(path.startsWith('/') ? path : `/${path}`, API_BASE);
}

/** GET /public/manage/:token */
export async function fetchManageView(
  token: string,
): Promise<ManageAppointmentView> {
  const res = await fetch(buildUrl(`/public/manage/${encodeURIComponent(token)}`), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { code?: string; message?: string })
    | null;
  if (!res.ok) {
    throw classifyError(res.status, body);
  }
  return body as unknown as ManageAppointmentView;
}

export type CancelManageResult = {
  appointment: {
    id: string;
    state: ManageAppointmentState;
    cancelledAt: string | null;
  };
  message: string;
};

/** PATCH /public/manage/:token/cancel */
export async function cancelByMagicLink(args: {
  token: string;
  reason?: string;
  idempotencyKey: string;
}): Promise<CancelManageResult> {
  const res = await fetch(
    buildUrl(`/public/manage/${encodeURIComponent(args.token)}/cancel`),
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify(args.reason ? { reason: args.reason } : {}),
      cache: 'no-store',
    },
  );
  const body = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { code?: string; message?: string })
    | null;
  if (!res.ok) {
    throw classifyError(res.status, body);
  }
  return body as unknown as CancelManageResult;
}

export type RescheduleManageResult = {
  appointment: {
    id: string;
    state: ManageAppointmentState;
    scheduledStartAt: string;
    scheduledEndAt: string;
  };
  message: string;
};

/** PATCH /public/manage/:token/reschedule */
export async function rescheduleByMagicLink(args: {
  token: string;
  newScheduledStartAt: string;
  idempotencyKey: string;
}): Promise<RescheduleManageResult> {
  const res = await fetch(
    buildUrl(`/public/manage/${encodeURIComponent(args.token)}/reschedule`),
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
      },
      body: JSON.stringify({ newScheduledStartAt: args.newScheduledStartAt }),
      cache: 'no-store',
    },
  );
  const body = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { code?: string; message?: string })
    | null;
  if (!res.ok) {
    throw classifyError(res.status, body);
  }
  return body as unknown as RescheduleManageResult;
}
