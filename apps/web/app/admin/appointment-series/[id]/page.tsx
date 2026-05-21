import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Alert, Badge, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getClient } from '@/lib/api/clients';
import { getService } from '@/lib/api/services';
import { getStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';

import {
  getAppointmentSeries,
  type AppointmentSeries,
  type SeriesCadence,
  type SeriesStatus,
} from '../_api';
import { CancelSeriesDialog } from './CancelSeriesDialog';
import { OccurrencesTable } from './OccurrencesTable';

const DAY_LABEL: Record<number, string> = {
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function cadenceSummary(series: AppointmentSeries): string {
  const label = CADENCE_LABEL[series.cadence];
  if (series.cadence === 'monthly') return label;
  if (series.daysOfWeek.length === 0) return label;
  const sorted = [...series.daysOfWeek].sort((a, b) => a - b);
  return `${label} · ${sorted.map((d) => DAY_LABEL[d] ?? '?').join(', ')}`;
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  });
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getAppointmentSeries>>;
  try {
    detail = await getAppointmentSeries(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const { series, occurrences } = detail;

  // Resolve display names. We swallow per-fetch errors so the detail page
  // still renders even if one related entity is gone (e.g. soft-deleted
  // service). Each related call is a separate /admin endpoint — admin role
  // already enforced by apiFetch + Clerk Bearer.
  const [
    clientResult,
    serviceResult,
    staffResult,
    whoamiResult,
  ] = await Promise.all([
    getClient(series.clientId).catch(() => null),
    getService(series.serviceId).catch(() => null),
    getStaff(series.staffId).catch(() => null),
    getWhoami().catch(() => null),
  ]);

  const clientName = clientResult
    ? clientResult.client.firstName +
      (clientResult.client.lastName
        ? ` ${clientResult.client.lastName}`
        : '')
    : series.clientId.slice(0, 8);
  const serviceName = serviceResult?.service.name ?? series.serviceId.slice(0, 8);
  const staffName = staffResult
    ? staffResult.staff.firstName +
      (staffResult.staff.lastName ? ` ${staffResult.staff.lastName}` : '')
    : series.staffId.slice(0, 8);
  const locationName =
    whoamiResult?.locations.find((l) => l.id === series.locationId)?.name ??
    series.locationId.slice(0, 8);

  const endLabel = series.endsOn
    ? `until ${formatDate(series.endsOn)}`
    : series.occurrenceCount !== null
    ? `for ${series.occurrenceCount} occurrence${series.occurrenceCount === 1 ? '' : 's'}`
    : 'open-ended';

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/appointment-series"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to series
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Recurring series</span>
          <h1 className="t-display-lg">{serviceName}</h1>
          <p className="t-body-md text-ink-soft">
            {staffName} · {cadenceSummary(series)} · {series.timeOfDay} ·{' '}
            {formatDate(series.anchorDate)} {endLabel}
          </p>
        </div>
        <Badge tone={statusTone(series.status)}>{series.status}</Badge>
      </header>

      {series.status === 'cancelled' && (
        <Alert tone="warning">
          <div className="flex flex-col gap-s1">
            <span className="font-semibold">Series cancelled</span>
            <span className="t-body-sm">
              {series.cancelReason
                ? `Reason: ${series.cancelReason}`
                : 'No reason recorded.'}{' '}
              · {formatDateTime(series.cancelledAt)}
              {series.cancelledByUserId
                ? ` · by user ${series.cancelledByUserId.slice(0, 8)}`
                : ''}
            </span>
          </div>
        </Alert>
      )}

      <Card padding="md">
        <div className="grid gap-s5 sm:grid-cols-2">
          <Field label="Client">
            <Link
              href={`/admin/clients/${series.clientId}` as never}
              className="text-accent no-underline hover:underline"
            >
              {clientName}
            </Link>
          </Field>
          <Field label="Location">{locationName}</Field>
          <Field label="Service">{serviceName}</Field>
          <Field label="Staff">{staffName}</Field>
          <Field label="Cadence">{cadenceSummary(series)}</Field>
          <Field label="Time of day">{series.timeOfDay}</Field>
          <Field label="Anchor date">{formatDate(series.anchorDate)}</Field>
          <Field label="End condition">
            {series.endsOn
              ? `Ends on ${formatDate(series.endsOn)}`
              : series.occurrenceCount !== null
              ? `${series.occurrenceCount} occurrence${series.occurrenceCount === 1 ? '' : 's'}`
              : '—'}
          </Field>
          <Field label="Duration (snapshot)">
            {series.durationMinutesSnapshot} min
          </Field>
          <Field label="Price (snapshot)">
            {formatMoney(series.priceCentsSnapshot)}
          </Field>
          <Field label="Created">{formatDateTime(series.createdAt)}</Field>
          <Field label="Updated">{formatDateTime(series.updatedAt)}</Field>
        </div>
      </Card>

      <section className="flex flex-col gap-s3">
        <header className="flex items-center justify-between gap-s4">
          <div>
            <h2 className="t-display-sm">Occurrences</h2>
            <p className="t-body-sm text-ink-soft">
              {occurrences.length} occurrence
              {occurrences.length === 1 ? '' : 's'} generated. Past visits are
              dimmed; cancelled rows are struck through.
            </p>
          </div>
        </header>
        <OccurrencesTable occurrences={occurrences} />
      </section>

      {series.status === 'active' && (
        <section className="flex flex-col gap-s3">
          <header>
            <h2 className="t-display-sm">Actions</h2>
            <p className="t-body-sm text-ink-soft">
              Cancelling the series stops it from generating new occurrences
              and cancels every future, non-completed appointment.
            </p>
          </header>
          <div>
            <CancelSeriesDialog seriesId={series.id} />
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-s1">
      <span className="t-caption font-semibold text-ink-soft">{label}</span>
      <span className="t-body-md text-ink">{children}</span>
    </div>
  );
}
