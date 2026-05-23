'use client';

import Link from 'next/link';
import type { Route } from 'next';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';

import { transitionAppointmentAction } from '@/app/admin/calendar/_actions';
import { MoreIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

// Compact kebab menu rendered on each UpcomingAppointmentCard. Hosts three
// row actions: View (navigates to the calendar with ?selected=…), Reschedule
// (Coming soon dimmed item) and Cancel (inline confirm + reason → calls
// transitionAppointmentAction(id, 'cancelled', reason)).
//
// Click-outside closes the menu (mousedown listener compared against the
// menu container ref). After a successful cancel we call router.refresh()
// so the server-rendered upcoming list re-fetches.

function toCalendarDateParam(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function UpcomingActions({
  appointmentId,
  appointmentStartIso,
  // clientId is part of the interface contract — reserved for a future
  // "edit on calendar with client filter" navigation; intentionally unused
  // for the current View link which only needs ?date= and ?selected=.
}: {
  appointmentId: string;
  appointmentStartIso: string;
  clientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (!ref.current) return;
      if (ev.target instanceof Node && !ref.current.contains(ev.target)) {
        setOpen(false);
        setConfirming(false);
        setReason('');
        setError(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
    setReason('');
    setError(null);
  }, []);

  const viewHref = (
    `/admin/calendar?date=${toCalendarDateParam(appointmentStartIso)}&selected=${appointmentId}`
  ) as Route;

  const onCancel = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await transitionAppointmentAction(
        appointmentId,
        'cancelled',
        reason.trim() || undefined,
      );
      if (!res.ok) {
        setError(res.error ?? 'Cancel failed.');
        return;
      }
      close();
      router.refresh();
    });
  }, [appointmentId, reason, startTransition, close, router]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Appointment actions"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full',
          'border border-line bg-surface text-ink-3',
          'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
        )}
      >
        <MoreIcon size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-10 mt-s2 w-56 overflow-hidden rounded-md',
            'border border-line bg-surface shadow-md',
          )}
        >
          {!confirming ? (
            <ul className="flex flex-col py-s1">
              <li>
                <Link
                  href={viewHref}
                  onClick={close}
                  className={cn(
                    'block px-s4 py-s2 t-body-sm text-ink no-underline',
                    'hover:bg-surface-2',
                  )}
                  role="menuitem"
                >
                  View
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Coming soon — reschedule lands in next release"
                  className={cn(
                    'block w-full px-s4 py-s2 text-left t-body-sm text-ink-3',
                    'cursor-not-allowed opacity-60',
                  )}
                  role="menuitem"
                >
                  Reschedule
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(true);
                    setError(null);
                  }}
                  className={cn(
                    'block w-full px-s4 py-s2 text-left t-body-sm text-terracotta',
                    'hover:bg-surface-2',
                  )}
                  role="menuitem"
                >
                  Cancel
                </button>
              </li>
            </ul>
          ) : (
            <div className="flex flex-col gap-s2 p-s3">
              <p className="t-body-sm text-ink">Cancel this appointment?</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional reason"
                rows={3}
                maxLength={500}
                className={cn(
                  'w-full rounded-sm border border-line bg-surface px-s2 py-s2',
                  't-body-sm text-ink placeholder:text-ink-3',
                  'focus:border-sage focus:outline-none',
                )}
              />
              {error && (
                <p className="t-body-sm text-terracotta">{error}</p>
              )}
              <div className="flex items-center justify-between gap-s2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                  className={cn(
                    'rounded-sm border border-line bg-surface px-s3 py-s1',
                    't-body-sm text-ink-3 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={pending}
                  className={cn(
                    'rounded-sm bg-terracotta px-s3 py-s1',
                    't-body-sm font-semibold text-ink-inv',
                    'disabled:opacity-60',
                  )}
                >
                  {pending ? 'Cancelling…' : 'Confirm cancel'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
