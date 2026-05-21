'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui';

import type { ManageAppointmentView } from './_api';
import { rescheduleManageAction } from './_actions';
import { formatFullWhen, formatRange } from './format';
import { SuccessCard } from './SuccessCard';

interface RescheduleCardProps {
  token: string;
  view: ManageAppointmentView;
}

/** datetime-local renders the user's local tz and emits "YYYY-MM-DDTHH:mm".
 *  Convert to UTC ISO for the API, which expects an RFC-3339 timestamp
 *  with offset (Zod `.datetime({ offset: true })`). */
function localInputToIso(localValue: string): string | null {
  if (!localValue) return null;
  const ms = Date.parse(localValue);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Reverse — turn an ISO string into a value the datetime-local input
 *  accepts, expressed in the visitor's local timezone. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  // Pad each component to two digits; toISOString would force UTC.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function RescheduleCard({ token, view }: RescheduleCardProps) {
  const { appointment, rescheduleAllowed } = view;
  // Default the picker to the existing appointment time so the user can
  // see the current value as a starting point.
  const initialValue = useMemo(
    () => isoToLocalInput(appointment.scheduledStartAt),
    [appointment.scheduledStartAt],
  );
  const [pickedLocal, setPickedLocal] = useState(initialValue);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState<null | {
    scheduledStartAt: string;
    scheduledEndAt: string;
  }>(null);
  const [pending, startTransition] = useTransition();

  // datetime-local's `min` keeps the picker from suggesting the past.
  const nowLocal = useMemo(() => isoToLocalInput(new Date().toISOString()), []);

  if (done) {
    return (
      <SuccessCard
        token={token}
        title="Appointment rescheduled."
        body={`Your ${appointment.service.name} is now ${formatFullWhen(
          done.scheduledStartAt,
        )} (${formatRange(done.scheduledStartAt, done.scheduledEndAt)}).`}
      />
    );
  }

  if (!rescheduleAllowed) {
    return (
      <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
        <span className="t-eyebrow text-accent">Reschedule</span>
        <h1 className="mt-s2 t-display-md text-ink">
          This appointment can&apos;t be rescheduled in its current state.
        </h1>
        <p className="mt-s3 t-body-md text-ink-soft">
          Contact the business if you need help moving it.
        </p>
        <div className="mt-s5">
          <a
            href={`/manage/${encodeURIComponent(token)}`}
            className="no-underline"
          >
            <Button
              variant="ghost"
              size="md"
              type="button"
              className="border border-surface-3 bg-white shadow-sm"
            >
              Back
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const onSubmit = () => {
    setErrorMessage(null);
    const iso = localInputToIso(pickedLocal);
    if (!iso) {
      setErrorMessage('Pick a date and time first.');
      return;
    }
    if (Date.parse(iso) <= Date.now()) {
      setErrorMessage('Pick a time in the future.');
      return;
    }
    startTransition(() => {
      void (async () => {
        const res = await rescheduleManageAction({
          token,
          newScheduledStartAt: iso,
        });
        if (res.ok) {
          setDone({
            scheduledStartAt: res.result.appointment.scheduledStartAt,
            scheduledEndAt: res.result.appointment.scheduledEndAt,
          });
          return;
        }
        // The server tells us why — slot conflict, schedule block, not
        // allowed, validation. Surface the message inline either way.
        setErrorMessage(
          res.code === 'SLOT_CONFLICT'
            ? 'Someone else just booked that time. Try another.'
            : res.code === 'STAFF_SCHEDULE_BLOCK_CONFLICT'
              ? "That time is blocked off on the provider's calendar. Try another."
              : res.code === 'RESCHEDULE_NOT_ALLOWED'
                ? "This appointment can't be rescheduled in its current state — contact us if you need help."
                : res.message,
        );
      })();
    });
  };

  return (
    <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <span className="t-eyebrow text-accent">Reschedule</span>
      <h1 className="mt-s2 t-display-md text-ink">Pick a new time</h1>
      <p className="mt-s3 t-body-md text-ink-soft">
        Currently {formatFullWhen(appointment.scheduledStartAt)} ·{' '}
        {formatRange(appointment.scheduledStartAt, appointment.scheduledEndAt)}.
      </p>

      <label className="mt-s6 flex max-w-md flex-col gap-s2">
        <span className="t-caption font-semibold text-ink">
          New date and time
        </span>
        <input
          type="datetime-local"
          // Spec: 15-minute interval is reasonable; the server still validates.
          step={15 * 60}
          min={nowLocal}
          value={pickedLocal}
          onChange={(e) => setPickedLocal(e.target.value)}
          className="rounded-xl border border-surface-3 bg-white px-s3 py-s3 t-body-md text-ink shadow-sm"
        />
        <span className="t-caption text-ink-soft">
          Times show in your local timezone. {appointment.service.durationMinutes}{' '}
          min visit.
        </span>
      </label>

      {errorMessage ? (
        <p
          className="mt-s4 rounded-xl border border-red-200 bg-red-50 px-s3 py-s3 t-body-sm text-red-900"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-s6 flex flex-wrap gap-s3">
        <Button
          variant="accent"
          size="md"
          type="button"
          loading={pending}
          onClick={onSubmit}
        >
          Submit new time
        </Button>
        <a
          href={`/manage/${encodeURIComponent(token)}`}
          className="no-underline"
        >
          <Button
            variant="ghost"
            size="md"
            type="button"
            className="border border-surface-3 bg-white shadow-sm"
          >
            Back
          </Button>
        </a>
      </div>
    </div>
  );
}
