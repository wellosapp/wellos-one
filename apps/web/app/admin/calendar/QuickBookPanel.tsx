'use client';

// useFormState / useFormStatus (react-dom) are the React-18 equivalents of
// React 19's useActionState. Next 14 runs on React 18.
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
}

// Submit button uses useFormStatus so it can disable + spin while the
// action is in flight. Must be a child of the <form>.
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
}: QuickBookPanelProps) {
  const router = useRouter();
  const [state, formAction] = useFormState<ActionState, FormData>(
    createAppointmentAction,
    INITIAL,
  );

  // Default location = first one returned by /admin/whoami. Single-location
  // tenants never see the picker. Multi-location tenants get a Select.
  const [locationId, setLocationId] = useState<string>(
    locations[0]?.id ?? '',
  );
  const [serviceId, setServiceId] = useState<string>('');
  const [staffId, setStaffId] = useState<string>('');
  const [date, setDate] = useState<string>(dateParam);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState<string>('');

  // Client typeahead state — debounced search, list of matches, currently
  // chosen client.
  const [clientQuery, setClientQuery] = useState<string>('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [chosenClient, setChosenClient] = useState<Client | null>(null);
  const [searchPending, startSearch] = useTransition();

  // Availability state — slots for the picked staff/service/date triple.
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsPending, startSlots] = useTransition();

  // Search clients with a 250ms debounce — we want fast feel without
  // hammering the API on every keystroke.
  useEffect(() => {
    if (chosenClient) return; // Skip while a client is locked in.
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

  // Refresh availability whenever the deciding inputs change. Slot is
  // cleared so a stale selection can't survive a context change.
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

  // Close + revalidate after a successful create.
  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const canSubmit = Boolean(
    locationId && chosenClient && staffId && serviceId && slot,
  );

  // Group slots into morning / afternoon / evening for readability.
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

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Quick book"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Quick book</span>
          <h2 className="t-display-md text-ink">New appointment</h2>
        </div>
      }
    >
      <div className="px-s6 py-s5">
        {state.error && !state.ok && (
          <div className="mb-s4">
            <Alert tone="error">
              {state.error}
              {state.conflict && (
                <div className="mt-s1 t-body-sm">
                  Existing booking{' '}
                  {formatTimeLocal(state.conflict.scheduledStartAt)} –{' '}
                  {formatTimeLocal(state.conflict.scheduledEndAt)} on this
                  staff calendar.
                </div>
              )}
            </Alert>
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-s4">
          {/* Location — only shown when there's a real choice */}
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

          {/* Client typeahead */}
          <FormField
            label="Client"
            required
            error={state.fieldErrors?.clientId}
          >
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
                  placeholder="Search by name, email, or phone…"
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

          {/* Service */}
          <FormField
            label="Service"
            required
            error={state.fieldErrors?.serviceId}
          >
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

          {/* Staff */}
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

          {/* Date */}
          <FormField label="Date" required>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>

          {/* Availability slots */}
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
                    <span className="t-eyebrow text-ink-soft">
                      {bucket.label}
                    </span>
                    <div className="flex flex-wrap gap-s2">
                      {bucket.items.map((s) => {
                        const active = slot?.startAt === s.startAt;
                        return (
                          <button
                            type="button"
                            key={s.startAt}
                            onClick={() => setSlot(s)}
                            className={cn(
                              'rounded-sm border px-s3 py-[6px] t-body-sm font-medium',
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

          {/* Optional notes */}
          <FormField label="Notes (optional)" error={state.fieldErrors?.notes}>
            <Input
              type="text"
              name="notes"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes for this booking"
            />
          </FormField>

          <div className="flex justify-end gap-s2 border-t border-surface-3 pt-s4">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
            >
              Cancel
            </Button>
            <SubmitButton disabled={!canSubmit} />
          </div>
        </form>
      </div>
    </Drawer>
  );
}
