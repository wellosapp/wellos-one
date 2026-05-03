'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import {
  Alert,
  Badge,
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
import {
  staffBookingFormsRequiringBookingAck,
  staffBookingItemsRequiringAcknowledgment,
  type StaffBookingClientContextResponse,
  type StaffBookingClientStatus,
} from '@/lib/staff-booking/client-context-types';
import { formatTimeLocal } from '@/lib/calendar';
import { formatUsdFromCents } from '@/lib/money';
import { useMediaQuery } from '@/lib/use-media-query';

import {
  createAppointmentAction,
  listServicesForBookingAction,
  loadAvailabilitySlotsAction,
  loadStaffBookingClientContextAction,
  quickBookCreateClientInline,
  searchClientsAction,
  type ActionState,
} from './_actions';
import { QuickBookAlertAckSection } from './QuickBookAlertAckSection';
import {
  bookingFormBadgeTone,
  bookingFormStatusLabel,
} from './booking-form-helpers';
import { QuickBookFormsAckSection } from './QuickBookFormsAckSection';

const INITIAL: ActionState = { ok: false };

function clientStatusBadge(status: StaffBookingClientStatus): {
  tone: 'neutral' | 'accent' | 'red' | 'amber' | 'green';
  label: string;
} {
  switch (status) {
    case 'banned':
      return { tone: 'red', label: 'Banned' };
    case 'inactive':
      return { tone: 'neutral', label: 'Inactive' };
    case 'deceased':
      return { tone: 'neutral', label: 'Deceased' };
    case 'vip':
      return { tone: 'accent', label: 'VIP' };
    case 'high_touch':
      return { tone: 'amber', label: 'High touch' };
    case 'needs_admin_approval':
      return { tone: 'amber', label: 'Needs approval' };
    default:
      return { tone: 'green', label: 'Active' };
  }
}

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
  const [bookableServices, setBookableServices] = useState<Service[]>(services);
  const [date, setDate] = useState<string>(dateParam);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [notes, setNotes] = useState<string>('');

  const [clientQuery, setClientQuery] = useState<string>('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [chosenClient, setChosenClient] = useState<Client | null>(null);
  const [searchPending, startSearch] = useTransition();

  const [clientContext, setClientContext] =
    useState<StaffBookingClientContextResponse | null>(null);
  const [clientContextLoading, setClientContextLoading] = useState(false);
  const [clientContextError, setClientContextError] = useState<string | null>(null);

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsPending, startSlots] = useTransition();
  const [servicesPending, startServicesLoad] = useTransition();
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInFirst, setWalkInFirst] = useState('');
  const [walkInLast, setWalkInLast] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInPending, startWalkInCreate] = useTransition();

  const [ackChecked, setAckChecked] = useState<Record<string, boolean>>({});
  const [formsAckChecked, setFormsAckChecked] = useState(false);

  useEffect(() => {
    if (lockedStaffId) setStaffId(lockedStaffId);
  }, [lockedStaffId]);

  const effectiveStaffId = lockedStaffId ?? staffId;

  useEffect(() => {
    if (!effectiveStaffId) {
      setBookableServices([]);
      return;
    }
    let cancelled = false;
    startServicesLoad(async () => {
      const res = await listServicesForBookingAction(effectiveStaffId);
      if (cancelled) return;
      if (res.error) {
        setBookableServices(services);
        return;
      }
      setBookableServices(res.services);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveStaffId, services]);

  useEffect(() => {
    if (!serviceId) return;
    if (!bookableServices.some((s) => s.id === serviceId)) {
      setServiceId('');
      setSlot(null);
    }
  }, [bookableServices, serviceId]);

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
    if (!chosenClient) {
      setClientContext(null);
      setClientContextError(null);
      setClientContextLoading(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      setClientContextLoading(true);
      setClientContextError(null);
      void loadStaffBookingClientContextAction({
        clientId: chosenClient.id,
        serviceId: serviceId || undefined,
        staffId: (lockedStaffId ?? staffId) || undefined,
      }).then((res) => {
        if (cancelled) return;
        setClientContextLoading(false);
        if (res.error) {
          setClientContextError(res.error);
          setClientContext(null);
          return;
        }
        setClientContextError(null);
        setClientContext(res.context);
      });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [chosenClient, serviceId, staffId, lockedStaffId]);

  useEffect(() => {
    if (lockedStaffId) return;
    const pref = clientContext?.snapshot.preferredStaffMemberId;
    if (!pref || staffId) return;
    if (!staff.some((s) => s.id === pref)) return;
    setStaffId(pref);
  }, [
    lockedStaffId,
    clientContext?.snapshot.preferredStaffMemberId,
    staff,
    staffId,
  ]);

  useEffect(() => {
    setAckChecked({});
  }, [chosenClient?.id, serviceId, effectiveStaffId]);

  const alertsNeedingAck = useMemo(
    () =>
      clientContext
        ? staffBookingItemsRequiringAcknowledgment(clientContext)
        : [],
    [clientContext],
  );

  const formsNeedingAck = useMemo(
    () =>
      clientContext
        ? staffBookingFormsRequiringBookingAck(clientContext)
        : [],
    [clientContext],
  );

  useEffect(() => {
    setSlot(null);
    setSlotsError(null);
    if (!locationId || !serviceId || !effectiveStaffId || !date) {
      setSlots([]);
      return;
    }
    startSlots(async () => {
      const res = await loadAvailabilitySlotsAction({
        locationId,
        serviceId,
        staffId: effectiveStaffId,
        date,
      });
      if (res.error) {
        setSlots([]);
        setSlotsError(res.error);
        return;
      }
      setSlots(res.slots);
    });
  }, [locationId, serviceId, effectiveStaffId, date]);

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const ackComplete =
    alertsNeedingAck.length === 0 ||
    alertsNeedingAck.every((a) => ackChecked[a.id]);

  const formsAckComplete =
    formsNeedingAck.length === 0 || formsAckChecked;

  const canSubmit = Boolean(
    locationId &&
      chosenClient &&
      effectiveStaffId &&
      serviceId &&
      slot &&
      ackComplete &&
      formsAckComplete,
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
  const selectedService = bookableServices.find((s) => s.id === serviceId);

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
                    No matches — search again or create a walk-in below.
                  </span>
                )}
              <div className="flex flex-col gap-s2 border-t border-surface-3 pt-s3">
                <button
                  type="button"
                  className="t-body-sm text-left text-accent underline-offset-2 hover:underline"
                  onClick={() => {
                    setWalkInOpen((o) => !o);
                    setWalkInError(null);
                  }}
                >
                  {walkInOpen ? 'Hide new walk-in client' : 'New walk-in client'}
                </button>
                {walkInOpen && (
                  <div className="flex flex-col gap-s2 rounded-md border border-surface-3 bg-surface-2/60 px-s3 py-s3">
                    <span className="t-caption text-ink-soft">
                      Creates the client and selects them for this booking (staff
                      booking + CRM spec).
                    </span>
                    <Input
                      placeholder="First name"
                      value={walkInFirst}
                      onChange={(e) => setWalkInFirst(e.target.value)}
                      autoComplete="given-name"
                    />
                    <Input
                      placeholder="Last name (optional)"
                      value={walkInLast}
                      onChange={(e) => setWalkInLast(e.target.value)}
                      autoComplete="family-name"
                    />
                    <Input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={walkInPhone}
                      onChange={(e) => setWalkInPhone(e.target.value)}
                      autoComplete="tel"
                    />
                    <Input
                      type="email"
                      placeholder="Email (optional)"
                      value={walkInEmail}
                      onChange={(e) => setWalkInEmail(e.target.value)}
                      autoComplete="email"
                    />
                    {walkInError && (
                      <span className="t-caption text-red">{walkInError}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={walkInPending}
                      disabled={walkInPending || !walkInFirst.trim()}
                      onClick={() => {
                        setWalkInError(null);
                        startWalkInCreate(async () => {
                          const res = await quickBookCreateClientInline({
                            firstName: walkInFirst,
                            lastName: walkInLast || undefined,
                            phone: walkInPhone || undefined,
                            email: walkInEmail || undefined,
                          });
                          if (!res.ok) {
                            setWalkInError(res.error);
                            return;
                          }
                          setChosenClient(res.client);
                          setWalkInOpen(false);
                          setWalkInFirst('');
                          setWalkInLast('');
                          setWalkInPhone('');
                          setWalkInEmail('');
                          setClientQuery('');
                          setClientResults([]);
                        });
                      }}
                    >
                      Create & select client
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          {chosenClient && (
            <input type="hidden" name="clientId" value={chosenClient.id} />
          )}
        </FormField>

        {chosenClient && (
          <div className="flex flex-col gap-s2">
            {clientContextLoading && (
              <span className="t-caption text-ink-soft">Loading client snapshot…</span>
            )}
            {clientContextError && (
              <Alert tone="error">{clientContextError}</Alert>
            )}
            {!clientContextLoading && !clientContextError && clientContext && (
              <div
                className="rounded-xl border border-surface-3 bg-surface px-s3 py-s3"
                aria-label="Client CRM snapshot"
              >
                {(() => {
                  const statusB = clientStatusBadge(clientContext.client.status);
                  return (
                <div className="flex flex-col gap-s2">
                  <div className="flex flex-col gap-s1 border-b border-surface-3 pb-s2">
                    <div className="flex flex-wrap items-center justify-between gap-s2">
                      <span className="t-body font-semibold text-ink">
                        {clientContext.client.displayName}
                      </span>
                      <Badge tone={statusB.tone}>{statusB.label}</Badge>
                    </div>
                    {clientContext.client.preferredName ? (
                      <p className="t-caption text-ink-soft">
                        Goes by{' '}
                        <span className="font-medium text-ink">
                          {clientContext.client.preferredName}
                        </span>
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-px t-caption text-ink-soft">
                      {clientContext.client.phone ? (
                        <span>{clientContext.client.phone}</span>
                      ) : null}
                      {clientContext.client.email ? (
                        <span className="truncate">{clientContext.client.email}</span>
                      ) : null}
                      {!clientContext.client.phone && !clientContext.client.email ? (
                        <span>No phone or email on file</span>
                      ) : null}
                    </div>
                    {(clientContext.client.smsOptedOut ||
                      clientContext.client.emailOptedOut) && (
                      <ul className="mt-s1 list-inside list-disc t-caption text-amber-900">
                        {clientContext.client.smsOptedOut ? (
                          <li>SMS reminders off — prefer email where possible.</li>
                        ) : null}
                        {clientContext.client.emailOptedOut ? (
                          <li>Email off — prefer SMS or in-person confirmation.</li>
                        ) : null}
                      </ul>
                    )}
                  </div>
                  <span className="t-eyebrow text-ink-soft">Client snapshot</span>
                  <dl className="grid grid-cols-2 gap-x-s3 gap-y-s1 t-caption text-ink">
                    <dt className="text-ink-soft">Last visit</dt>
                    <dd className="font-medium text-ink">
                      {clientContext.snapshot.lastVisitAt
                        ? new Date(clientContext.snapshot.lastVisitAt).toLocaleDateString(
                            undefined,
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )
                        : '—'}
                    </dd>
                    <dt className="text-ink-soft">Completed visits</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {clientContext.snapshot.totalVisits}
                    </dd>
                    <dt className="text-ink-soft">Lifetime value</dt>
                    <dd className="font-medium text-ink tabular-nums">
                      {formatUsdFromCents(
                        clientContext.snapshot.lifetimeValueCents,
                      )}
                    </dd>
                    <dt className="text-ink-soft">Preferred provider</dt>
                    <dd className="font-medium text-ink">
                      {(() => {
                        const id =
                          clientContext.snapshot.preferredStaffMemberId;
                        if (!id) return '—';
                        const s = staff.find((x) => x.id === id);
                        if (!s) return '—';
                        return (
                          <>
                            {s.firstName}
                            {s.lastName ? ` ${s.lastName}` : ''}
                          </>
                        );
                      })()}
                    </dd>
                  </dl>
                  <div className="border-t border-surface-3 pt-s2">
                    <span className="t-eyebrow text-ink-soft">
                      Payments & schedule
                    </span>
                    <dl className="mt-s1 grid grid-cols-2 gap-x-s3 gap-y-s1 t-caption text-ink">
                      <dt className="text-ink-soft">Outstanding</dt>
                      <dd className="font-medium text-ink tabular-nums">
                        {formatUsdFromCents(
                          clientContext.payments.outstandingBalanceCents,
                        )}
                      </dd>
                      <dt className="text-ink-soft">Upcoming booked</dt>
                      <dd className="font-medium text-ink tabular-nums">
                        {formatUsdFromCents(
                          clientContext.payments.upcomingCommittedValueCents,
                        )}
                      </dd>
                      <dt className="text-ink-soft">Card on file</dt>
                      <dd className="font-medium text-ink">
                        {clientContext.payments.hasSavedPaymentMethod
                          ? 'Yes'
                          : 'No'}
                      </dd>
                    </dl>
                    <p className="mt-s2 t-caption leading-snug text-ink-soft">
                      Lifetime and per-visit amounts use list prices captured on
                      the appointment until a payments ledger is connected.
                    </p>
                  </div>
                  {clientContext.recentVisits.length > 0 ? (
                    <div className="border-t border-surface-3 pt-s2">
                      <span className="t-eyebrow text-ink-soft">
                        Recent visits
                      </span>
                      <ul className="mt-s2 flex flex-col gap-s2">
                        {clientContext.recentVisits.slice(0, 4).map((v) => (
                          <li
                            key={v.appointmentId}
                            className="border-b border-surface-3 pb-s2 last:border-b-0 last:pb-0"
                          >
                            <div className="flex items-start justify-between gap-s2">
                              <span className="t-caption font-medium text-ink">
                                {new Date(
                                  v.scheduledStartAt,
                                ).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                              {v.amountPaidCents != null ? (
                                <span className="shrink-0 t-caption tabular-nums text-ink-soft">
                                  {formatUsdFromCents(v.amountPaidCents)}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-s1 line-clamp-1 t-caption text-ink">
                              {v.serviceName ?? 'Service'}
                              {v.staffName ? (
                                <span className="text-ink-soft">
                                  {' '}
                                  · {v.staffName}
                                </span>
                              ) : null}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {clientContext.client.tags.length > 0 && (
                    <div className="flex flex-wrap gap-s1">
                      {clientContext.client.tags.slice(0, 6).map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                      {clientContext.client.tags.length > 6 && (
                        <span className="t-caption text-ink-soft">
                          +{clientContext.client.tags.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                  {(() => {
                    const lines = [
                      ...clientContext.alerts,
                      ...clientContext.pinnedNotes,
                    ].slice(0, 2);
                    if (lines.length === 0) return null;
                    return (
                      <ul className="flex flex-col gap-s1 border-t border-surface-3 pt-s2">
                        {lines.map((a) => (
                          <li key={a.id} className="t-caption text-ink">
                            <span className="font-semibold text-amber-900">
                              {a.title || a.category}
                            </span>
                            {a.body ? (
                              <span className="block text-ink-soft line-clamp-2">
                                {a.body}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  {clientContext.forms.length > 0 ? (
                    <div className="border-t border-surface-3 pt-s2">
                      <span className="t-eyebrow text-ink-soft">
                        Forms & questionnaires
                      </span>
                      <div className="mt-s2 flex flex-wrap gap-s1">
                        {clientContext.forms.slice(0, 8).map((f) => (
                          <Badge
                            key={f.id}
                            tone={bookingFormBadgeTone(f.status)}
                            className="max-w-full truncate"
                            title={`${f.label} — ${bookingFormStatusLabel(f.status)}`}
                          >
                            <span className="font-medium">{f.label}</span>
                            <span className="text-ink-soft">
                              {' '}
                              · {bookingFormStatusLabel(f.status)}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                );
                })()}
              </div>
            )}
            {chosenClient && alertsNeedingAck.length > 0 && (
              <QuickBookAlertAckSection
                items={alertsNeedingAck}
                ackChecked={ackChecked}
                fieldErrors={state.fieldErrors}
                onAckChange={(id, checked) =>
                  setAckChecked((prev) => ({ ...prev, [id]: checked }))
                }
              />
            )}
            {chosenClient && formsNeedingAck.length > 0 && (
              <QuickBookFormsAckSection
                items={formsNeedingAck}
                checked={formsAckChecked}
                fieldErrors={state.fieldErrors}
                onChange={setFormsAckChecked}
              />
            )}
          </div>
        )}

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

        <FormField label="Service" required error={state.fieldErrors?.serviceId}>
          {servicesPending && effectiveStaffId ? (
            <span className="t-caption text-ink-soft">Loading services for this provider…</span>
          ) : null}
          <Select
            name="serviceId"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            disabled={
              !effectiveStaffId || Boolean(effectiveStaffId && servicesPending)
            }
          >
            <option value="">
              {!effectiveStaffId ? 'Select staff first…' : 'Select a service…'}
            </option>
            {bookableServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min
              </option>
            ))}
          </Select>
        </FormField>

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
          {!locationId || !serviceId || !effectiveStaffId || !date ? (
            <span className="t-caption italic text-ink-soft">
              Pick staff, service, and date to see open slots.
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
