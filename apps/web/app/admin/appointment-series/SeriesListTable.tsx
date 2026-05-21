import Link from 'next/link';

import { Badge, Card } from '@/components/ui';

import type { ListSeriesRow, SeriesCadence, SeriesStatus } from './_api';
import { CancelSeriesInlineForm } from './[id]/CancelSeriesDialog';

// Server component — renders the recurring-series table for the admin list
// page. Row Actions live in the rightmost column per project memory
// `feedback_admin_lists_need_row_actions` — every CRUD list ships with
// Edit + Cancel/Delete affordances from day one.

const DAY_ABBREV: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const CADENCE_LABEL: Record<SeriesCadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

function statusTone(s: SeriesStatus): 'green' | 'red' | 'neutral' {
  switch (s) {
    case 'active':
      return 'green';
    case 'cancelled':
      return 'red';
    case 'completed':
      return 'neutral';
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';
  const now = Date.now();
  const diffMs = target - now;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const future = diffMs > 0;
  let unit: string;
  let n: number;
  if (minutes < 60) {
    unit = 'minute';
    n = minutes;
  } else if (hours < 24) {
    unit = 'hour';
    n = hours;
  } else {
    unit = 'day';
    n = days;
  }
  const plural = n === 1 ? '' : 's';
  return future ? `in ${n} ${unit}${plural}` : `${n} ${unit}${plural} ago`;
}

function formatDateTimeShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cadenceSummary(
  cadence: SeriesCadence,
  daysOfWeek: number[] | undefined,
): string {
  const label = CADENCE_LABEL[cadence];
  if (cadence === 'monthly') return label;
  if (!daysOfWeek || daysOfWeek.length === 0) return label;
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  const days = sorted
    .map((d) => DAY_ABBREV[d] ?? '?')
    .join(', ');
  return `${label} · ${days}`;
}

interface SeriesListTableProps {
  rows: ListSeriesRow[];
  services: Record<string, { name: string; durationMinutes: number }>;
  staff: Record<string, { firstName: string; lastName: string | null }>;
}

export function SeriesListTable({
  rows,
  services,
  staff,
}: SeriesListTableProps) {
  return (
    <Card padding="sm" className="overflow-hidden p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Created</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Client</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
              Service · Staff
            </th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Cadence</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Next</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Remaining</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const svc = services[row.serviceId];
            const sf = staff[row.staffId];
            const clientName =
              row.clientFirstName +
              (row.clientLastName ? ` ${row.clientLastName}` : '');
            const staffName = sf
              ? sf.firstName + (sf.lastName ? ` ${sf.lastName}` : '')
              : row.staffId.slice(0, 8);
            const serviceName = svc?.name ?? row.serviceId.slice(0, 8);
            return (
              <tr
                key={row.seriesId}
                className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
              >
                <td
                  className="px-s4 py-s3 t-body-sm text-ink-soft"
                  title={new Date(row.createdAt).toLocaleString()}
                >
                  {formatRelative(row.createdAt)}
                </td>
                <td className="px-s4 py-s3 t-body-md">
                  <Link
                    href={`/admin/clients/${row.clientId}` as never}
                    className="text-accent no-underline hover:underline"
                  >
                    {clientName}
                  </Link>
                </td>
                <td className="px-s4 py-s3 t-body-sm text-ink">
                  <span>{serviceName}</span>
                  <span className="t-body-sm text-ink-soft"> · {staffName}</span>
                </td>
                <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                  {cadenceSummary(row.cadence, undefined)}
                </td>
                <td className="px-s4 py-s3">
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </td>
                <td
                  className="px-s4 py-s3 t-body-sm text-ink-soft"
                  title={
                    row.nextOccurrenceAt
                      ? new Date(row.nextOccurrenceAt).toLocaleString()
                      : undefined
                  }
                >
                  {row.nextOccurrenceAt
                    ? `${formatDateTimeShort(row.nextOccurrenceAt)} (${formatRelative(row.nextOccurrenceAt)})`
                    : '—'}
                </td>
                <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                  {row.remainingOccurrences}
                </td>
                <td className="px-s4 py-s3">
                  <div className="flex items-center justify-end gap-s3">
                    <Link
                      href={
                        `/admin/appointment-series/${row.seriesId}` as never
                      }
                      className="t-body-sm text-accent no-underline hover:underline"
                    >
                      View
                    </Link>
                    {row.status === 'active' && (
                      <CancelSeriesInlineForm seriesId={row.seriesId} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
