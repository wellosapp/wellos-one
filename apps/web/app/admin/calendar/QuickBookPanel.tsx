'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import {
  Alert,
  Button,
  Drawer,
  FormField,
  Input,
  Select,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AvailableSlot } from '@/lib/api/availability';
import type { Client } from '@/lib/api/clients';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';
import { formatTimeLocal } from '@/lib/calendar';
import { useMediaQuery } from '@/lib/use-media-query';

import {
  createAppointmentAction,
  loadAvailabilitySlotsAction,
  searchClientsAction,
  type ActionState,
} from './_actions';

const INITIAL: ActionState = { ok: false };

interface QuickBookPanelProps {
  staff: Staff[];
  services: Service[];
  locations: WhoamiLocation[];
  dateParam: string;
  onClose: () => void;
  /** Admin vs staff-safe copy and fields. */
  variant?: 'admin' | 'staff';
  /** When set, staff picker is hidden and this id is submitted. */
  lockedStaffId?: string | null;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="md"
      disabled={disabled || pending}
      loading={pending}
      className="w-full min-h-[44px]"
    >
      Book appointment
    </Button>
  );
}

export function QuickBookPanel({
  staff,
  services,
  locations,
  dateParam,
  onClose,
  variant = 'admin',
  lockedStaffId,
}: QuickBookPanelProps) {
  const router = useRouter();
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [state, formAction] = useFormState<ActionState, FormData>(
    createAppointmentAction,
    INITIAL,
  );

  const [locationId, setLocationId] = useState<string>(
    locations[0]?.id ?? '',
  );
  const [serviceId, setServiceId] = useState<string>('');
  const [staffId, setStaffId] = useState<string>(lockedStaffId ?? '');
  const [date, setDate] = useState<string>(dateParam);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState<string>('');

  const [clientQuery, setClientQuery] = useState<string>('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [chosenClient, setChosenClient] = useState<Client | null>(null);
  const [searchPending, startSearch] = useTransition();

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsPending, startSlots] = useTransition();

  useEffect(() => {
    if (lockedStaffId) setStaffId(lockedStaffId);
  }, [lockedStaffId]);

  useEffect(() => {
    if (chosenClient) return;
    const handle = setTimeout(() => {
      const q = clientQuery.trim();
      if (q.length < 2) {
        setClientResults([]);
        return;
      }
      startSearch(async () => {
        const res = await searchClientsAction(q);
        if (!res.error) setClientResults(res.clients);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [clientQuery, chosenClient]);

  useEffect(() => {
    setSlot(null);
    setSlotsError(null);
    if (!locationId || !serviceId || !staffId || !date) {
      setSlots([]);
      return;
    }
    startSlots(async () => {
      const res = await loadAvailabilitySlotsAction({
        locationId,
        serviceId,
        staffId,
        date,
      });
      if (res.error) {
        setSlots([]);
        setSlotsError(res.error);
        return;
      }
      setSlots(res.slots);
    });
  }, [locationId, serviceId, staffId, date]);

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const canSubmit = Boolean(
    locationId && chosenClient && staffId && serviceId && slot,
  );

  const slotsBuckets = useMemo(() => {
    const morning: AvailableSlot[] = [];
    const afternoon: AvailableSlot[] = [];
    const evening: AvailableSlot[] = [];
    for (const s of slots) {
      const hour = new Date(s.startAt).getHours();
      if (hour < 12) morning.push(s);
      else if (hour < 17) afternoon.push(s);
      else evening.push(s);
    }
    return [
      { label: 'Morning', items: morning },
      { label: 'Afternoon', items: afternoon },
      { label: 'Evening', items: evening },
    ].filter((b) => b.items.length > 0);
  }, [slots]);

  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  const headerBlock = (
    <div className="flex flex-col gap-s3 border-b border-surface-3 pb-s4">
      <div className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">
          {variant === 'staff' ? 'Staff quick book' : 'Quick book'}
        </span>
        <h2 className="t-display-md text-ink">New appointment</h2>
        <p className="t-body-sm text-ink-soft">
          {variant === 'staff'
            ? 'Fast booking for your own schedule. Admin-only controls stay in the admin calendar.'
            : 'Search a client, pick service and time, and book in one pass.'}
        </p>
      </div>
      {variant === 'admin' && (
        <div className="flex flex-wrap gap-s2">
          <span className="rounded-full bg-green-pale px-s3 py-s1 t-caption font-semibold text-green">
            Admin booking
          </span>
          <span className="rounded-full bg-surface-2 px-s3 py-s1 t-caption font-semibold text-ink-soft">
            Slot holds via availability API
          </span>
        </div>
      )}
      {variant === 'staff' && (
        <div
          className="rounded-xl border border-amber/25 bg-amber-pale px-s3 py-s3 t-caption font-semibold text-amber-900"
          role="note"
        >
          Client allergy alerts and profile notes appear when you select a
          client.
        </div>
      )}
    </div>
  );

  const summaryCard =
    selectedService && selectedStaff && slot ? (
      <div className="rounded-xl border border-surface-3 bg-surface px-s3 py-s3">
        <strong className="t-body-sm text-ink">Booking summary</strong>
        <span className="mt-s1 block t-caption text-ink-soft">
          {selectedService.name} · {selectedStaff.firstName}
          {selectedStaff.lastName ? ` ${selectedStaff.lastName}` : ''} ·{' '}
          {new Date(date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
          , {formatTimeLocal(slot.startAt)}
        </span>
      </div>
    ) : null;

  const formInner = (
    <>
      {state.error && !state.ok && (
        <div className="mb-s4">
          <Alert tone="error">
            {state.error}
            {state.conflict && (
              <div className="mt-s1 t-body-sm">
                Existing booking{' '}
                {formatTimeLocal(state.conflict.scheduledStartAt)} –{' '}
                {formatTimeLocal(state.conflict.scheduledEndAt)} on this staff
                calendar.
              </div>
            )}
          </Alert>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-s4">
        {locations.length > 1 ? (
          <FormField
            label="Location"
            required
            error={state.fieldErrors?.locationId}
          >
            <Select
              name="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}

        <FormField label="Client" required error={state.fieldErrors?.clientId}>
          {chosenClient ? (
            <div className="flex items-center justify-between gap-s3 rounded-md border border-surface-3 bg-white px-s3 py-s2">
              <div className="flex flex-col">
                <span className="t-body-md text-ink">
                  {chosenClient.firstName}
                  {chosenClient.lastName ? ` ${chosenClient.lastName}` : ''}
                </span>
                <span className="t-caption text-ink-soft">
                  {chosenClient.email ?? chosenClient.phone ?? '—'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  setChosenClient(null);
                  setClientQuery('');
                  setClientResults([]);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-s2">
              <Input
                type="search"
                placeholder={
                  variant === 'staff'
                    ? 'Search client or create new in Clients…'
                    : 'Search by name, email, or phone…'
                }
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              {searchPending && (
                <span className="t-caption text-ink-soft">Searching…</span>
              )}
              {clientResults.length > 0 && (
                <ul className="flex max-h-[180px] flex-col overflow-y-auto rounded-md border border-surface-3 bg-white">
                  {clientResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setChosenClient(c);
                          setClientResults([]);
                        }}
                        className={cn(
                          'flex w-full flex-col items-start gap-[2px] px-s3 py-s2 text-left',
                          'transition-colors duration-fast hover:bg-surface-2',
                        )}
                      >
                        <span className="t-body-sm text-ink">
                          {c.firstName}
                          {c.lastName ? ` ${c.lastName}` : ''}
                        </span>
                        <span className="t-caption text-ink-soft">
                          {c.email ?? c.phone ?? '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searchPending &&
                clientQuery.trim().length >= 2 &&
                clientResults.length === 0 && (
                  <span className="t-caption text-ink-soft italic">
                    No matches. Add the client first under Clients.
                  </span>
                )}
            </div>
          )}
          {chosenClient && (
            <input type="hidden" name="clientId" value={chosenClient.id} />
          )}
        </FormField>

        <FormField label="Service" required error={state.fieldErrors?.serviceId}>
          <Select
            name="serviceId"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min
              </option>
            ))}
          </Select>
        </FormField>

        {lockedStaffId ? (
          <input type="hidden" name="staffId" value={lockedStaffId} />
        ) : (
          <FormField label="Staff" required error={state.fieldErrors?.staffId}>
            <Select
              name="staffId"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">Select staff…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName}
                  {s.lastName ? ` ${s.lastName}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Date" required>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </FormField>

        <div className="flex flex-col gap-s2">
          <span className="t-body-sm font-medium text-ink-soft">
            Available start times
          </span>
          {slotsError && <Alert tone="error">{slotsError}</Alert>}
          {!locationId || !serviceId || !staffId || !date ? (
            <span className="t-caption italic text-ink-soft">
              Pick a service, staff, and date to see open slots.
            </span>
          ) : slotsPending ? (
            <span className="t-caption text-ink-soft">Loading slots…</span>
          ) : slots.length === 0 ? (
            <span className="t-caption italic text-ink-soft">
              No availability for that day. Try another date or staff.
            </span>
          ) : (
            <div className="flex flex-col gap-s3">
              {slotsBuckets.map((bucket) => (
                <div key={bucket.label} className="flex flex-col gap-s2">
                  <span className="t-eyebrow text-ink-soft">{bucket.label}</span>
                  <div className="flex flex-wrap gap-s2">
                    {bucket.items.map((s) => {
                      const active = slot?.startAt === s.startAt;
                      return (
                        <button
                          type="button"
                          key={s.startAt}
                          onClick={() => setSlot(s)}
                          className={cn(
                            'rounded-md border px-s3 py-[6px] t-body-sm font-medium',
                            'transition-colors duration-fast',
                            active
                              ? 'border-accent bg-accent text-white'
                              : 'border-surface-3 bg-white text-ink hover:border-accent/50 hover:bg-accent-pale',
                          )}
                        >
                          {formatTimeLocal(s.startAt)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {slot && (
            <input
              type="hidden"
              name="scheduledStartAt"
              value={slot.startAt}
            />
          )}
          {state.fieldErrors?.scheduledStartAt && (
            <span className="t-caption font-sans text-red">
              {state.fieldErrors.scheduledStartAt}
            </span>
          )}
        </div>

        {summaryCard}

        <FormField
          label={
            variant === 'staff'
              ? 'Visit-linked note'
              : 'Appointment-linked note'
          }
          error={state.fieldErrors?.notes}
        >
          <Input
            type="text"
            name="notes"
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              variant === 'staff'
                ? 'Saves to appointment and client profile'
                : 'Internal notes for this booking'
            }
          />
        </FormField>

        <div className="flex flex-col gap-s2 border-t border-surface-3 pt-s4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton disabled={!canSubmit} />
        </div>
      </form>
    </>
  );

  const shellClass =
    'rounded-xl border border-surface-3 bg-white p-s5 shadow-sm lg:max-w-[360px]';

  if (isLg) {
    return (
      <aside className={cn(shellClass, 'sticky top-20')} aria-label="Quick book">
        {headerBlock}
        <div className="pt-s4">{formInner}</div>
      </aside>
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Quick book"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">
            {variant === 'staff' ? 'Staff quick book' : 'Quick book'}
          </span>
          <h2 className="t-display-md text-ink">New appointment</h2>
        </div>
      }
    >
      <div className="px-s6 py-s5">
        {variant === 'admin' && (
          <div className="mb-s4 flex flex-wrap gap-s2">
            <span className="rounded-full bg-green-pale px-s3 py-s1 t-caption font-semibold text-green">
              Admin booking
            </span>
          </div>
        )}
        {variant === 'staff' && (
          <div className="mb-s4 rounded-xl border border-amber/25 bg-amber-pale px-s3 py-s3 t-caption font-semibold text-amber-900">
            Client alerts appear when you select a client.
          </div>
        )}
        {formInner}
      </div>
    </Drawer>
  );
}
