import Link from 'next/link';
import type { Route } from 'next';

import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listClassCheckInAttempts,
  type ClassCheckInAttempt,
  type ClassCheckInAttemptResult,
} from '@/lib/api/class-check-in-attempts';

// /admin/class-check-in-attempts — fraud-audit list. PR 10 of the
// Geofence Auto Check-in epic. Read-only review of the
// class_check_in_attempt rows written on every check-in attempt
// (success + failure).
//
// Acting on flagged attempts (blocking clients, reversing check-ins from
// review) is intentionally out of scope — that's a future fraud-response
// epic. This is the audit pane only.

const PAGE_SIZE = 50;

const RESULT_VALUES: ReadonlyArray<{
  value: '' | ClassCheckInAttemptResult;
  label: string;
}> = [
  { value: '', label: 'All results' },
  { value: 'success', label: 'Success' },
  { value: 'out_of_range', label: 'Out of range' },
  { value: 'out_of_window', label: 'Out of window' },
  { value: 'low_accuracy', label: 'Low accuracy' },
  { value: 'suspicious_pattern', label: 'Suspicious pattern' },
  { value: 'rate_limited', label: 'Rate limited' },
  { value: 'error', label: 'Error' },
];

type SearchParams = {
  from?: string;
  to?: string;
  result?: string;
  classInstanceId?: string;
  cursor?: string;
};

function isResultValue(v: unknown): v is ClassCheckInAttemptResult {
  return (
    v === 'success' ||
    v === 'out_of_range' ||
    v === 'out_of_window' ||
    v === 'low_accuracy' ||
    v === 'suspicious_pattern' ||
    v === 'rate_limited' ||
    v === 'error'
  );
}

function resultTone(
  result: string,
): 'green' | 'red' | 'amber' | 'neutral' {
  if (result === 'success') return 'green';
  if (result === 'suspicious_pattern') return 'red';
  if (
    result === 'out_of_range' ||
    result === 'out_of_window' ||
    result === 'low_accuracy' ||
    result === 'rate_limited'
  ) {
    return 'amber';
  }
  return 'neutral';
}

function resultLabel(result: string): string {
  const found = RESULT_VALUES.find((r) => r.value === result);
  return found?.label ?? result;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function clientName(attempt: ClassCheckInAttempt): string {
  return (
    [attempt.client.firstName, attempt.client.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Client'
  );
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  // input[type=date] wants YYYY-MM-DD only.
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function toIsoStart(date: string | undefined): string | undefined {
  if (!date) return undefined;
  // Normalize the picked day to start-of-day UTC. Audit rows are stamped in
  // UTC; tightening to local midnight would shift the day boundary in a way
  // the user doesn't expect.
  return `${date}T00:00:00.000Z`;
}

function toIsoEnd(date: string | undefined): string | undefined {
  if (!date) return undefined;
  return `${date}T23:59:59.999Z`;
}

export default async function ClassCheckInAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const fallback = defaultDateRange();
  const fromDate = sp.from || fallback.from;
  const toDate = sp.to || fallback.to;
  const resultFilter = isResultValue(sp.result) ? sp.result : undefined;
  const classInstanceId = sp.classInstanceId?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  let data: Awaited<ReturnType<typeof listClassCheckInAttempts>> | null = null;
  let errorMessage: string | null = null;

  try {
    data = await listClassCheckInAttempts({
      from: toIsoStart(fromDate),
      to: toIsoEnd(toDate),
      result: resultFilter,
      classInstanceId,
      cursor,
      take: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  // Preserve the current filters when paging — only swap the cursor.
  const baseQuery: Record<string, string> = {
    from: fromDate,
    to: toDate,
    ...(resultFilter ? { result: resultFilter } : {}),
    ...(classInstanceId ? { classInstanceId } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-start justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Operations</span>
          <h1 className="t-display-lg">Check-in audit</h1>
          <p className="t-body-sm text-ink-soft">
            Every geofence and manual class check-in attempt — success or
            failure — is logged here for fraud review. Rows older than 90
            days are auto-purged.
          </p>
        </div>
      </header>

      <Card padding="sm">
        <form
          method="get"
          className="flex flex-wrap items-end gap-s3"
          action="/admin/class-check-in-attempts"
        >
          <div className="flex flex-col gap-s1">
            <label htmlFor="from" className="t-caption text-ink-soft">
              From
            </label>
            <Input
              id="from"
              type="date"
              name="from"
              defaultValue={fromDate}
            />
          </div>
          <div className="flex flex-col gap-s1">
            <label htmlFor="to" className="t-caption text-ink-soft">
              To
            </label>
            <Input id="to" type="date" name="to" defaultValue={toDate} />
          </div>
          <div className="flex flex-col gap-s1">
            <label htmlFor="result" className="t-caption text-ink-soft">
              Result
            </label>
            <Select
              id="result"
              name="result"
              defaultValue={resultFilter ?? ''}
              className="min-w-[180px]"
            >
              {RESULT_VALUES.map((r) => (
                <option key={r.value || 'all'} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-s1">
            <label
              htmlFor="classInstanceId"
              className="t-caption text-ink-soft"
            >
              Class instance ID (optional)
            </label>
            <Input
              id="classInstanceId"
              name="classInstanceId"
              defaultValue={classInstanceId ?? ''}
              placeholder="cuid…"
              className="min-w-[240px]"
            />
          </div>
          <Button variant="primary" size="md" type="submit">
            Apply
          </Button>
        </form>
      </Card>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {data && (
        <>
          <p className="t-body-sm text-ink-soft">
            {data.attempts.length === 0
              ? 'No attempts in this window.'
              : `Showing ${data.attempts.length} attempt${data.attempts.length === 1 ? '' : 's'}.`}
          </p>

          {data.attempts.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-surface-3 bg-surface-2 text-left">
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        When
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Client
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Class instance
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Method
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Result
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Location
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        Distance (m)
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        User agent
                      </th>
                      <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                        IP
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attempts.map((a) => {
                      const mapUrl =
                        a.submittedLat !== null && a.submittedLng !== null
                          ? `https://www.google.com/maps?q=${a.submittedLat},${a.submittedLng}`
                          : null;
                      const truncatedUa = a.userAgent
                        ? a.userAgent.length > 40
                          ? `${a.userAgent.slice(0, 40)}…`
                          : a.userAgent
                        : '—';
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                        >
                          <td className="px-s4 py-s3 t-body-sm text-ink-soft whitespace-nowrap">
                            {formatTimestamp(a.attemptedAt)}
                          </td>
                          <td className="px-s4 py-s3 t-body-sm">
                            <Link
                              href={
                                `/admin/clients/${a.clientId}` as Route
                              }
                              className="text-accent no-underline hover:underline"
                            >
                              {clientName(a)}
                            </Link>
                          </td>
                          <td className="px-s4 py-s3 t-body-sm">
                            <Link
                              href={
                                `/staff/classes/${a.classInstance.id}` as Route
                              }
                              className="text-accent no-underline hover:underline"
                            >
                              {a.classInstance.className}
                            </Link>
                            <div className="t-caption text-ink-soft">
                              {formatTimestamp(
                                a.classInstance.scheduledStartAt,
                              )}
                            </div>
                          </td>
                          <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                            {a.method}
                          </td>
                          <td className="px-s4 py-s3">
                            <Badge tone={resultTone(a.result)}>
                              {resultLabel(a.result)}
                            </Badge>
                          </td>
                          <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                            {mapUrl ? (
                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-accent no-underline hover:underline"
                              >
                                {a.submittedLat!.toFixed(5)},{' '}
                                {a.submittedLng!.toFixed(5)}
                              </a>
                            ) : (
                              '—'
                            )}
                            {a.submittedAccuracyMeters !== null && (
                              <div className="t-caption text-ink-soft">
                                ±{a.submittedAccuracyMeters}m
                              </div>
                            )}
                          </td>
                          <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                            {a.distanceFromGeofenceMeters === null
                              ? '—'
                              : a.distanceFromGeofenceMeters.toFixed(0)}
                          </td>
                          <td
                            className="px-s4 py-s3 t-caption text-ink-soft"
                            title={a.userAgent ?? ''}
                          >
                            {truncatedUa}
                          </td>
                          <td className="px-s4 py-s3 t-caption text-ink-soft">
                            {a.ipAddress ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {data.nextCursor && (
            <div className="flex items-center gap-s4">
              <Link
                href={{
                  pathname: '/admin/class-check-in-attempts',
                  query: { ...baseQuery, cursor: data.nextCursor },
                }}
                className="t-body-sm text-accent no-underline hover:underline"
              >
                Next page →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
