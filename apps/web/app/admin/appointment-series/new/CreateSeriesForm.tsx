'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
} from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  createSeriesAction,
  getServiceStaffIdsAction,
  searchClientsForSeriesAction,
  type CreateSeriesActionState,
  type SeriesFormValues,
} from '../_actions';
import type { SeriesCadence } from '../_api';

// CreateSeriesForm — client component driving /admin/appointment-series/new.
// Mirrors the QuickBook pattern in apps/web/app/admin/calendar/QuickBookPanel.tsx
// for client typeahead. No dry-run endpoint at MVP — the user submits, sees
// 409 / 422 / 400 errors inline, fixes, and resubmits per PR S3 spec.

const INITIAL: CreateSeriesActionState = { ok: false };

const CADENCE_OPTIONS: Array<{ value: SeriesCadence; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
];

interface CreateSeriesFormProps {
  staff: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
  }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    basePriceCents: number;
  }>;
  locations: Array<{ id: string; name: string }>;
}

type ClientHit = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="md"
      disabled={disabled || pending}
      loading={pending}
    >
      Create series
    </Button>
  );
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function CreateSeriesForm({
  staff,
  services,
  locations,
}: CreateSeriesFormProps) {
  const [state, formAction] = useFormState<CreateSeriesActionState, FormData>(
    createSeriesAction,
    INITIAL,
  );

  const echoed: Partial<SeriesFormValues> =
    state && 'values' in state && state.values ? state.values : {};
  const fieldErrors =
    state && 'fieldErrors' in state && state.fieldErrors
      ? state.fieldErrors
      : undefined;
  const conflicts =
    state && 'conflicts' in state && state.conflicts
      ? state.conflicts
      : undefined;
  const topError =
    state && 'error' in state && !state.ok ? state.error : null;

  const [locationId, setLocationId] = useState<string>(
    echoed.locationId ?? (locations.length === 1 ? locations[0]?.id ?? '' : ''),
  );
  const [serviceId, setServiceId] = useState<string>(echoed.serviceId ?? '');
  const [staffId, setStaffId] = useState<string>(echoed.staffId ?? '');
  const [cadence, setCadence] = useState<SeriesCadence>(
    echoed.cadence ?? 'weekly',
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    echoed.daysOfWeek ?? [],
  );
  const [timeOfDay, setTimeOfDay] = useState<string>(echoed.timeOfDay ?? '');
  const [anchorDate, setAnchorDate] = useState<string>(echoed.anchorDate ?? '');
  const [endMode, setEndMode] = useState<'count' | 'date'>(
    echoed.endMode ?? 'count',
  );
  const [occurrenceCount, setOccurrenceCount] = useState<string>(
    echoed.occurrenceCount ?? '8',
  );
  const [endsOn, setEndsOn] = useState<string>(echoed.endsOn ?? '');

  const [clientId, setClientId] = useState<string>(echoed.clientId ?? '');
  const [clientLabel, setClientLabel] = useState<string>('');
  const [clientQuery, setClientQuery] = useState<string>('');
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [searchPending, startSearch] = useTransition();

  const [eligibleStaffIds, setEligibleStaffIds] = useState<string[] | null>(
    null,
  );
  const [eligibleLoading, startEligibleLoad] = useTransition();

  // Service typeahead via client-side filter (catalog is small; we already
  // loaded up to 200 above).
  const [serviceQuery, setServiceQuery] = useState<string>('');
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );
  const matchingServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services.slice(0, 30);
    return services
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [services, serviceQuery]);

  // Reload eligible-staff list when service changes. Mirrors the
  // assignmentCount > 0 check in the API: if no staff are explicitly
  // assigned, every staff member is eligible (API skips the assignment
  // check); otherwise we must filter to the assigned set.
  useEffect(() => {
    if (!serviceId) {
      setEligibleStaffIds(null);
      return;
    }
    startEligibleLoad(async () => {
      const res = await getServiceStaffIdsAction(serviceId);
      // Treat an empty assignment list as "any staff" (matches API behaviour).
      setEligibleStaffIds(res.staffIds.length > 0 ? res.staffIds : null);
    });
  }, [serviceId]);

  const filteredStaff = useMemo(() => {
    if (!eligibleStaffIds) return staff;
    return staff.filter((s) => eligibleStaffIds.includes(s.id));
  }, [staff, eligibleStaffIds]);

  // If the chosen staff is no longer eligible, clear them.
  useEffect(() => {
    if (!staffId) return;
    if (!filteredStaff.some((s) => s.id === staffId)) {
      setStaffId('');
    }
  }, [filteredStaff, staffId]);

  // Debounced client search.
  useEffect(() => {
    if (clientId) return;
    const handle = setTimeout(() => {
      const q = clientQuery.trim();
      if (q.length < 2) {
        setClientHits([]);
        return;
      }
      startSearch(async () => {
        const res = await searchClientsForSeriesAction(q);
        if (!res.error) setClientHits(res.clients);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [clientQuery, clientId]);

  const toggleDay = (iso: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(iso)
        ? prev.filter((d) => d !== iso)
        : [...prev, iso].sort((a, b) => a - b),
    );
  };

  const showDayPicker = cadence === 'weekly' || cadence === 'biweekly';

  const canSubmit = Boolean(
    locationId &&
      clientId &&
      serviceId &&
      staffId &&
      timeOfDay &&
      anchorDate &&
      (cadence === 'monthly' || daysOfWeek.length > 0) &&
      (endMode === 'count'
        ? Number(occurrenceCount) >= 1 && Number(occurrenceCount) <= 365
        : endsOn),
  );

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      {topError && !state.ok && (
        <Alert tone="error">
          <div className="flex flex-col gap-s2">
            <span>{topError}</span>
            {conflicts && conflicts.length > 0 && (
              <div className="rounded-md border border-red/30 bg-white px-s3 py-s3 t-body-sm">
                <strong>Conflicts ({conflicts.length})</strong>
                <ul className="mt-s2 list-disc pl-s4">
                  {conflicts.slice(0, 8).map((c, idx) => (
                    <li
                      key={`${c.scheduledStartAt}-${idx}`}
                      className="text-ink"
                    >
                      {formatDateTime(c.scheduledStartAt)} — {c.reason.replace(/_/g, ' ')}
                    </li>
                  ))}
                  {conflicts.length > 8 && (
                    <li className="text-ink-soft">
                      …and {conflicts.length - 8} more.
                    </li>
                  )}
                </ul>
                <p className="mt-s2 t-body-sm text-ink-soft">
                  Pick a different staff, time, or day-of-week set and try
                  again.
                </p>
              </div>
            )}
          </div>
        </Alert>
      )}

      {/* Client typeahead */}
      <FormField label="Client" required error={fieldErrors?.clientId}>
        {clientId ? (
          <div className="flex items-center justify-between gap-s3 rounded-md border border-surface-3 bg-surface-2 px-s3 py-s2">
            <span className="t-body-md text-ink">{clientLabel || clientId}</span>
            <button
              type="button"
              className="t-body-sm text-accent underline-offset-2 hover:underline"
              onClick={() => {
                setClientId('');
                setClientLabel('');
                setClientQuery('');
                setClientHits([]);
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-s2">
            <Input
              type="text"
              placeholder="Search name, email, or phone"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              error={Boolean(fieldErrors?.clientId)}
            />
            {searchPending && (
              <span className="t-body-sm text-ink-soft">Searching…</span>
            )}
            {clientHits.length > 0 && (
              <ul className="flex flex-col rounded-md border border-surface-3 bg-white shadow-sm">
                {clientHits.map((c) => {
                  const name =
                    c.firstName + (c.lastName ? ` ${c.lastName}` : '');
                  const detail = [c.email, c.phone]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li
                      key={c.id}
                      className="border-b border-surface-3 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientLabel(name);
                          setClientQuery('');
                          setClientHits([]);
                        }}
                        className="flex w-full flex-col gap-s1 px-s3 py-s2 text-left t-body-sm hover:bg-surface-2"
                      >
                        <span className="font-semibold text-ink">{name}</span>
                        {detail && (
                          <span className="t-caption text-ink-soft">
                            {detail}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <input type="hidden" name="clientId" value={clientId} />
      </FormField>

      {/* Service */}
      <FormField label="Service" required error={fieldErrors?.serviceId}>
        <div className="flex flex-col gap-s2">
          {selectedService ? (
            <div className="flex items-center justify-between gap-s3 rounded-md border border-surface-3 bg-surface-2 px-s3 py-s2">
              <span className="t-body-md text-ink">
                {selectedService.name}
                <span className="ml-s2 t-caption text-ink-soft">
                  {selectedService.durationMinutes} min ·{' '}
                  {formatMoney(selectedService.basePriceCents)}
                </span>
              </span>
              <button
                type="button"
                className="t-body-sm text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  setServiceId('');
                  setServiceQuery('');
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Input
                type="text"
                placeholder="Search services"
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                error={Boolean(fieldErrors?.serviceId)}
              />
              <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-surface-3 bg-white shadow-sm">
                {matchingServices.length === 0 && (
                  <li className="px-s3 py-s2 t-body-sm text-ink-soft">
                    No services match.
                  </li>
                )}
                {matchingServices.map((s) => (
                  <li
                    key={s.id}
                    className="border-b border-surface-3 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setServiceId(s.id);
                        setServiceQuery('');
                      }}
                      className="flex w-full items-center justify-between gap-s3 px-s3 py-s2 text-left t-body-sm hover:bg-surface-2"
                    >
                      <span className="text-ink">{s.name}</span>
                      <span className="t-caption text-ink-soft">
                        {s.durationMinutes} min ·{' '}
                        {formatMoney(s.basePriceCents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <input type="hidden" name="serviceId" value={serviceId} />
      </FormField>

      {/* Staff */}
      <FormField label="Staff" required error={fieldErrors?.staffId}>
        <Select
          name="staffId"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          disabled={!serviceId}
          error={Boolean(fieldErrors?.staffId)}
        >
          <option value="">
            {!serviceId
              ? 'Pick a service first'
              : eligibleLoading
              ? 'Loading…'
              : filteredStaff.length === 0
              ? 'No staff assigned to this service'
              : 'Pick a staff member'}
          </option>
          {filteredStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName}
              {s.lastName ? ` ${s.lastName}` : ''}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Location */}
      <FormField label="Location" required error={fieldErrors?.locationId}>
        <Select
          name="locationId"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          error={Boolean(fieldErrors?.locationId)}
        >
          <option value="">Pick a location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Cadence */}
      <FormField label="Cadence" required>
        <div className="inline-flex items-center gap-s1 rounded-md border border-surface-3 bg-surface-2 p-s1">
          {CADENCE_OPTIONS.map((opt) => {
            const isActive = cadence === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCadence(opt.value)}
                className={cn(
                  'rounded-sm px-s3 py-s1 t-body-sm transition-colors duration-fast',
                  isActive
                    ? 'bg-white font-semibold text-ink shadow-sm'
                    : 'text-ink-soft hover:text-ink',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="cadence" value={cadence} />
      </FormField>

      {/* Days of week */}
      {showDayPicker && (
        <FormField
          label="Days of week"
          required
          error={fieldErrors?.daysOfWeek}
        >
          <div className="flex flex-wrap items-center gap-s2">
            {DAYS.map((d) => {
              const isOn = daysOfWeek.includes(d.iso);
              return (
                <label
                  key={d.iso}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-s2 rounded-full border px-s3 py-s1 t-body-sm transition-colors duration-fast',
                    isOn
                      ? 'border-accent bg-accent-pale text-accent'
                      : 'border-surface-3 bg-white text-ink-soft hover:text-ink',
                  )}
                >
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={d.iso}
                    checked={isOn}
                    onChange={() => toggleDay(d.iso)}
                    className="sr-only"
                  />
                  {d.label}
                </label>
              );
            })}
          </div>
        </FormField>
      )}

      {/* Time + anchor */}
      <div className="grid gap-s4 sm:grid-cols-2">
        <FormField label="Time of day" required error={fieldErrors?.timeOfDay}>
          <Input
            type="time"
            name="timeOfDay"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
            error={Boolean(fieldErrors?.timeOfDay)}
          />
        </FormField>
        <FormField label="Anchor date" required error={fieldErrors?.anchorDate}>
          <Input
            type="date"
            name="anchorDate"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            error={Boolean(fieldErrors?.anchorDate)}
          />
        </FormField>
      </div>

      {/* End condition */}
      <FormField
        label="End condition"
        required
        error={fieldErrors?.endsOn ?? fieldErrors?.occurrenceCount}
      >
        <div className="flex flex-col gap-s3">
          <div className="inline-flex items-center gap-s1 rounded-md border border-surface-3 bg-surface-2 p-s1">
            <button
              type="button"
              onClick={() => setEndMode('count')}
              className={cn(
                'rounded-sm px-s3 py-s1 t-body-sm transition-colors duration-fast',
                endMode === 'count'
                  ? 'bg-white font-semibold text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              Stop after N occurrences
            </button>
            <button
              type="button"
              onClick={() => setEndMode('date')}
              className={cn(
                'rounded-sm px-s3 py-s1 t-body-sm transition-colors duration-fast',
                endMode === 'date'
                  ? 'bg-white font-semibold text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              Stop on date
            </button>
          </div>
          <input type="hidden" name="endMode" value={endMode} />
          {endMode === 'count' ? (
            <Input
              type="number"
              name="occurrenceCount"
              min={1}
              max={365}
              value={occurrenceCount}
              onChange={(e) => setOccurrenceCount(e.target.value)}
              error={Boolean(fieldErrors?.occurrenceCount)}
              className="max-w-[200px]"
            />
          ) : (
            <Input
              type="date"
              name="endsOn"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              error={Boolean(fieldErrors?.endsOn)}
              className="max-w-[260px]"
            />
          )}
        </div>
      </FormField>

      {/* Preview / snapshot card */}
      {selectedService && (
        <div className="rounded-xl border border-surface-3 bg-surface-2 px-s4 py-s3">
          <strong className="t-body-sm text-ink">Snapshot</strong>
          <p className="mt-s1 t-caption text-ink-soft">
            Wellos locks the service&apos;s current duration (
            {selectedService.durationMinutes} min) and price (
            {formatMoney(selectedService.basePriceCents)}) onto the series.
            Future service edits don&apos;t retro-shift this series.
          </p>
        </div>
      )}

      {/* Hidden non-display fields not otherwise serialized */}
      {/* daysOfWeek hidden mirror — only needed when picker is hidden (monthly) */}
      {!showDayPicker &&
        daysOfWeek.map((d) => (
          <input
            key={d}
            type="hidden"
            name="daysOfWeek"
            value={String(d)}
          />
        ))}

      <div className="flex items-center justify-end gap-s3">
        <SubmitButton disabled={!canSubmit} />
      </div>
    </form>
  );
}
