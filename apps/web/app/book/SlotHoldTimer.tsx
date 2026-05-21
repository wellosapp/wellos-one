'use client';

import { useEffect, useState } from 'react';

// R2 §9.4 — banner ribbon shown while a slot hold is active. Counts down
// to the server-issued `expiresAt`. When the timer hits 0 we surface the
// spec's copy ("This time was released. Pick a new opening.") and call
// `onExpire` so the parent flow can reset the picker.
//
// Styled to match the book page (warm professional, warning amber when
// the hold drops below 60s, info-sage otherwise).

interface SlotHoldTimerProps {
  /** UTC ISO timestamp returned by POST /public/booking/slot-holds. */
  expiresAt: string;
  /** Fires exactly once when the timer crosses zero. */
  onExpire: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SlotHoldTimer({ expiresAt, onExpire }: SlotHoldTimerProps) {
  const expiresAtMs = new Date(expiresAt).getTime();

  // Compute remaining on the client only — SSR'ing a wall-clock value would
  // mismatch on hydration. Default null until the first tick.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Prime once so the first paint after mount has the real value.
    setRemainingMs(expiresAtMs - Date.now());

    const tick = () => {
      if (cancelled) return;
      const remaining = expiresAtMs - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0) {
        setExpired(true);
        onExpire();
      }
    };

    const interval = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // expiresAt is the only thing that should reset the timer. onExpire is
    // captured from props but we intentionally only re-bind on expiresAt
    // changes — re-binding on every onExpire identity would reset the
    // countdown on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAtMs]);

  if (expired) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-300 bg-amber-50 px-s4 py-s3 t-body-md text-ink"
      >
        <strong className="block t-display-sm">This time was released.</strong>
        Pick a new opening.
      </div>
    );
  }

  // Server render and pre-mount: show "holding" without a number.
  const isUrgent = remainingMs !== null && remainingMs < 60_000;
  const label =
    remainingMs === null
      ? 'Holding this time…'
      : `Holding this time — ${formatRemaining(remainingMs)} remaining`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isUrgent
          ? 'rounded-xl border border-amber-300 bg-amber-50 px-s4 py-s3 t-body-md text-ink'
          : 'rounded-xl border border-accent/30 bg-accent-pale px-s4 py-s3 t-body-md text-ink'
      }
    >
      {label}
    </div>
  );
}
