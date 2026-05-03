'use client';

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import {
  createAppointmentAction,
  loadAvailabilitySlotsAction,
  loadStaffBookingClientContextAction,
  type ActionState,
} from '@/app/admin/calendar/_actions';
import { QuickBookAlertAckSection } from '@/app/admin/calendar/QuickBookAlertAckSection';
import { Alert, Badge, Button, Drawer, FormField, Input, Select } from '@/components/ui';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { AvailableSlot } from '@/lib/api/availability';
import type { WhoamiLocation } from '@/lib/api/whoami';
import { formatTimeLocal, toDateParam } from '@/lib/calendar';
import { cn } from '@/lib/cn';
import {
  staffBookingItemsRequiringAcknowledgment,
  type StaffBookingClientContextResponse,
} from '@/lib/staff-booking/client-context-types';

export type ClientQuickBookSummary = {
  id: string;
  firstName: string;
  lastName: string | null;
  banned: boolean;
  deletedAt: string | null;
  tags: Array<{ id: string; name: string; color: string | null }>;
};

const QB_INITIAL: ActionState = { ok: false };

function clientInitials(c: ClientQuickBookSummary): string {
  const a = c.firstName.trim()[0] ?? '';
  const b = c.lastName?.trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function displayName(c: ClientQuickBookSummary): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Client';
}

function shortRecordId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function ClientBadgeRow({ client }: { client: ClientQuickBookSummary }) {
  return (
    <div className="flex flex-wrap gap-s2">
      {!client.deletedAt && !client.banned && (
        <Badge tone="green">Active</Badge>
      )}
      {client.banned && <Badge tone="red">Banned</Badge>}
      {client.deletedAt && <Badge tone="neutral">Inactive</Badge>}
      {client.tags.slice(0, 5).map((t) => (
        <Badge key={t.id} tone="neutral">
          {t.name}
        </Badge>
      ))}
    </div>
  );
}

function SubmitBookButton({
  disabled,
  formId,
}: {
  disabled: boolean;
  formId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      form={formId}
      variant="accent"
      size="md"
      disabled={disabled || pending}
      loading={pending}
      className={cn(
        'min-h-[48px] flex-1 rounded-lg font-semibold shadow-md',
      )}
    >
      Book appointment
    </Button>
  );
}

function StepShell({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-surface-3 bg-white p-s4 shadow-sm',
      )}
    >
      <div className="flex gap-s3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            'bg-accent font-display text-sm font-bold tabular-nums text-white shadow-md ring-2 ring-white',
          )}
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display t-body-lg font-semibold text-ink">{title}</h3>
          <p className="mt-s1 t-body-sm leading-relaxed text-ink-soft">{hint}</p>
          <div className="mt-s4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function ClientQuickBookDrawer({
  open,
  onClose,
  client,
  services,
  staff,
  locations,
  directoryError,
  mode = 'drawer',
}: {
  open: boolean;
  onClose: () => void;
  client: ClientQuickBookSummary;
  services: Service[];
  staff: Staff[];
  locations: WhoamiLocation[];
  directoryError?: string | null;
  /** Full-width booking flow on the Book tab; header Quick Book stays `drawer`. */
  mode?: 'drawer' | 'inline';
}) {
  const router = useRouter();
  const formId = `client-qb-${client.id}`;
  const [state, formAction] = useFormState<ActionState, FormData>(
    createAppointmentAction,
    QB_INITIAL,
  );

  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => toDateParam(new Date()));
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsPending, startSlots] = useTransition();

  const [staffBookingContext, setStaffBookingContext] =
    useState<StaffBookingClientContextResponse | null>(null);
  const [staffBookingContextLoading, setStaffBookingContextLoading] =
    useState(false);
  const [staffBookingContextError, setStaffBookingContextError] = useState<
    string | null
  >(null);
  const [ackChecked, setAckChecked] = useState<Record<string, boolean>>({});

  const name = displayName(client);
  const initials = clientInitials(client);

  useEffect(() => {
    if (locations[0]?.id && !locationId) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

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
    if (!serviceId || !staffId) {
      setStaffBookingContext(null);
      setStaffBookingContextError(null);
      setStaffBookingContextLoading(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setStaffBookingContextLoading(true);
      setStaffBookingContextError(null);
      void loadStaffBookingClientContextAction({
        clientId: client.id,
        serviceId,
        staffId,
      }).then((res) => {
        if (cancelled) return;
        setStaffBookingContextLoading(false);
        if (res.error) {
          setStaffBookingContextError(res.error);
          setStaffBookingContext(null);
          return;
        }
        setStaffBookingContextError(null);
        setStaffBookingContext(res.context);
      });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [client.id, serviceId, staffId]);

  useEffect(() => {
    setAckChecked({});
  }, [client.id, serviceId, staffId]);

  const alertsNeedingAck = useMemo(
    () =>
      staffBookingContext
        ? staffBookingItemsRequiringAcknowledgment(staffBookingContext)
        : [],
    [staffBookingContext],
  );

  useEffect(() => {
    if (state.ok) {
      if (mode === 'drawer') onClose();
      router.refresh();
    }
  }, [state.ok, mode, onClose, router]);

  useEffect(() => {
    setServiceId('');
    setStaffId('');
    setSlot(null);
  }, [client.id]);

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedStaff = staff.find((s) => s.id === staffId);

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

  const ackComplete =
    alertsNeedingAck.length === 0 ||
    alertsNeedingAck.every((a) => ackChecked[a.id]);

  const canSubmit = Boolean(
    locationId &&
      client.id &&
      staffId &&
      serviceId &&
      slot &&
      ackComplete,
  );

  const directoryEmpty = services.length === 0 || staff.length === 0;

  const formBody = (
    <>
      <input type="hidden" name="clientId" value={client.id} />

      {state.error && !state.ok && (
        <div className="mb-s5">
          <Alert tone="error">
            {state.error}
            {state.conflict && (
              <div className="mt-s2 t-body-sm">
                Existing booking{' '}
                {formatTimeLocal(state.conflict.scheduledStartAt)} –{' '}
                {formatTimeLocal(state.conflict.scheduledEndAt)} on this staff
                calendar.
              </div>
            )}
          </Alert>
        </div>
      )}

      {directoryError && (
        <Alert tone="error" className="mb-s5">
          Could not load catalog data: {directoryError}
        </Alert>
      )}

      {!directoryError && directoryEmpty && (
        <Alert tone="warning" className="mb-s5">
          Add at least one active service and staff member before booking.
        </Alert>
      )}

      {!directoryError && !directoryEmpty && locations.length === 0 && (
        <Alert tone="warning" className="mb-s5">
          No locations on file. Complete onboarding to add a business location.
        </Alert>
      )}

      <div className="space-y-s4">
        {locations.length > 1 ? (
          <StepShell
            step={1}
            title="Location"
            hint="Where this appointment takes place."
          >
            <FormField label="Location" required>
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
          </StepShell>
        ) : (
          <input type="hidden" name="locationId" value={locationId} />
        )}

        <StepShell
          step={locations.length > 1 ? 2 : 1}
          title="Service"
          hint="Duration and pricing apply from the service catalog."
        >
          <FormField
            label="Service"
            required
            error={state.fieldErrors?.serviceId}
          >
            <Select
              name="serviceId"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSlot(null);
              }}
            >
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min · $
                  {(s.basePriceCents / 100).toFixed(0)}
                </option>
              ))}
            </Select>
          </FormField>
        </StepShell>

        <StepShell
          step={locations.length > 1 ? 3 : 2}
          title="Staff"
          hint="Only staff with openings for the chosen day appear in slots."
        >
          <FormField label="Staff" required error={state.fieldErrors?.staffId}>
            <Select
              name="staffId"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setSlot(null);
              }}
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
        </StepShell>

        <StepShell
          step={locations.length > 1 ? 4 : 3}
          title="Date"
          hint="Pick the day first; times load below."
        >
          <FormField label="Date" required>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot(null);
              }}
            />
          </FormField>
        </StepShell>

        <StepShell
          step={locations.length > 1 ? 5 : 4}
          title="Time"
          hint="Choose an available start time for this provider."
        >
          {slotsError && (
            <Alert tone="error" className="mb-s3">
              {slotsError}
            </Alert>
          )}
          {!locationId || !serviceId || !staffId || !date ? (
            <p className="t-body-sm italic text-ink-soft">
              Select service, staff, and date to load open times.
            </p>
          ) : slotsPending ? (
            <p className="t-caption text-ink-soft">Loading slots…</p>
          ) : slots.length === 0 ? (
            <p className="t-body-sm italic text-ink-soft">
              No availability that day. Try another date or staff member.
            </p>
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
                          key={s.startAt}
                          type="button"
                          onClick={() => setSlot(s)}
                          className={cn(
                            'rounded-lg border px-s3 py-s2 t-body-sm font-medium',
                            'transition-colors duration-fast',
                            active
                              ? 'border-accent bg-accent text-white shadow-sm'
                              : 'border-surface-3 bg-white text-ink hover:border-accent/40 hover:bg-accent-pale',
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
            <input type="hidden" name="scheduledStartAt" value={slot.startAt} />
          )}
          {state.fieldErrors?.scheduledStartAt && (
            <span className="mt-s2 t-caption text-red">
              {state.fieldErrors.scheduledStartAt}
            </span>
          )}
        </StepShell>

        <StepShell
          step={locations.length > 1 ? 6 : 5}
          title="Notes"
          hint="Optional — saves on the appointment and client record."
        >
          <FormField
            label="Appointment note"
            error={state.fieldErrors?.notes}
          >
            <Input
              type="text"
              name="notes"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal note for staff"
            />
          </FormField>
        </StepShell>

        {staffBookingContextLoading && (
          <p className="t-caption text-ink-soft">Loading client alerts…</p>
        )}
        {staffBookingContextError && (
          <Alert tone="error">{staffBookingContextError}</Alert>
        )}
        {alertsNeedingAck.length > 0 && (
          <QuickBookAlertAckSection
            items={alertsNeedingAck}
            ackChecked={ackChecked}
            fieldErrors={state.fieldErrors}
            onAckChange={(id, checked) =>
              setAckChecked((prev) => ({ ...prev, [id]: checked }))
            }
          />
        )}
      </div>
    </>
  );

  const bookingSummaryCard = (
    <div
      className={cn(
        'rounded-xl border border-surface-3 bg-gradient-to-b from-white to-surface/80 px-s4 py-s4 shadow-sm',
        mode === 'inline' && 'px-s6 py-s6',
      )}
    >
      <p className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
        Booking summary
      </p>
      <dl className="mt-s3 grid gap-s2">
        <div className="flex items-baseline justify-between gap-s4 border-b border-surface-3 pb-s2">
          <dt className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
            Service
          </dt>
          <dd className="t-body-sm font-medium text-ink">
            {selectedService?.name ?? '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-s4 border-b border-surface-3 pb-s2">
          <dt className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
            Provider
          </dt>
          <dd className="t-body-sm font-medium text-ink">
            {selectedStaff
              ? `${selectedStaff.firstName}${selectedStaff.lastName ? ` ${selectedStaff.lastName}` : ''}`
              : '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-s4">
          <dt className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
            When
          </dt>
          <dd className="t-body-sm font-medium text-ink">
            {slot && date
              ? `${new Date(date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })} · ${formatTimeLocal(slot.startAt)}`
              : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );

  const title = (
    <div className="min-w-0 flex-1 pr-s2">
      <span className="t-eyebrow tracking-[0.12em] text-accent">Quick Book</span>
      <div className="mt-s4 flex gap-s4">
        <div
          className={cn(
            'flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-2xl',
            'bg-gradient-to-br from-accent-pale via-white to-accent-pale/70',
            'font-display text-lg font-semibold text-accent shadow-md ring-2 ring-white',
          )}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="font-display t-display-sm font-semibold leading-snug text-ink">
            {name}
          </p>
          <p className="mt-s2 font-mono text-[0.78rem] leading-none text-ink-soft">
            {shortRecordId(client.id)}
          </p>
        </div>
      </div>
      <div className="mt-s4 border-t border-surface-3 pt-s4">
        <p className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
          Status
        </p>
        <div className="mt-s2">
          <ClientBadgeRow client={client} />
        </div>
      </div>
    </div>
  );

  if (mode === 'inline') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-s6 pb-s2">
        <div className="rounded-2xl border border-surface-3 bg-gradient-to-b from-accent-pale/45 via-white to-white p-s6 shadow-sm">
          <span className="t-eyebrow text-accent">Book</span>
          <h2 className="mt-s2 font-display t-display-sm text-ink">
            Schedule an appointment
          </h2>
          <p className="mt-s2 max-w-2xl t-body-sm leading-relaxed text-ink-soft">
            Choose service, provider, date, and time. This uses the same booking
            flow as Quick Book — optimized layout for the dedicated Book tab.
          </p>
        </div>

        <form
          id={formId}
          action={formAction}
          className="flex flex-col gap-s5"
        >
          {formBody}
        </form>

        {bookingSummaryCard}

        <div className="flex justify-end border-t border-surface-3 pt-s6">
          <SubmitBookButton disabled={!canSubmit} formId={formId} />
        </div>
      </div>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      widthClassName="w-full max-w-[min(100vw,420px)] sm:max-w-[420px]"
      panelClassName={cn(
        'overflow-hidden rounded-l-[1.75rem] border-l border-surface-3 bg-white shadow-lg',
      )}
      bodyClassName="bg-surface"
      ariaLabel="Quick Book"
      footer={
        <div className="flex flex-col gap-s5">
          {bookingSummaryCard}
          <div className="flex gap-s3">
            <Button
              type="button"
              variant="ghost"
              size="md"
              className={cn(
                'min-h-[48px] min-w-[108px] rounded-lg border border-surface-3 bg-white',
                'font-semibold text-ink-soft shadow-sm hover:bg-surface-2 hover:text-ink',
              )}
              onClick={onClose}
            >
              Cancel
            </Button>
            <SubmitBookButton disabled={!canSubmit} formId={formId} />
          </div>
        </div>
      }
    >
      <form
        id={formId}
        action={formAction}
        className="flex flex-col px-s5 pb-s8 pt-s4 sm:px-s6"
      >
        {formBody}
      </form>
    </Drawer>
  );
}
