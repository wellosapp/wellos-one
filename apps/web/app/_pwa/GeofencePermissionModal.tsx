'use client';

// Explanatory modal shown before triggering the OS location prompt for
// auto check-in. Mirrors the IOSInstallModal pattern (PR 2) — centered
// dialog, Esc + backdrop close, body-scroll lock, focus the close button
// on open.
//
// Spec copy: "Wellos uses your location only to check you in when you
// arrive at the studio. We don't track you otherwise."
//
// The "Allow location" button calls back into the GeofenceCheckInProvider
// via `onAllow`. Modal dismissal is owned by the consumer (banner sets
// state when the user picks "Not now").

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

interface GeofencePermissionModalProps {
  open: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  /** Class name shown in the modal subtitle. Optional — falls back to a
   *  generic line when absent. */
  className?: string;
}

export function GeofencePermissionModal({
  open,
  onAllow,
  onDismiss,
  className: bookingClassName,
}: GeofencePermissionModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc-to-close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onDismiss]);

  // Body scroll lock.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the close button on open for keyboard users.
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="geofence-permission-title"
    >
      <button
        type="button"
        aria-label="Close location permission dialog"
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-lg sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <h2
              id="geofence-permission-title"
              className="t-display-md text-ink"
            >
              Use your location to check in
            </h2>
            <span className="t-body-sm text-ink-soft">
              {bookingClassName
                ? `For ${bookingClassName} and future visits.`
                : 'For your upcoming class and future visits.'}
            </span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft',
              'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-s6 py-s5">
          <p className="t-body-md text-ink">
            Wellos uses your location only to check you in when you arrive
            at the studio. We don&apos;t track you otherwise.
          </p>
          <ul className="mt-s4 flex flex-col gap-s3 t-body-sm text-ink-soft">
            <li className="flex items-start gap-s3">
              <Dot />
              <span>
                Location is checked only when you have a class starting
                soon.
              </span>
            </li>
            <li className="flex items-start gap-s3">
              <Dot />
              <span>
                It stops as soon as you&apos;re checked in or the window
                ends.
              </span>
            </li>
            <li className="flex items-start gap-s3">
              <Dot />
              <span>You can revoke this any time in your browser.</span>
            </li>
          </ul>
        </div>

        <footer className="flex shrink-0 flex-col gap-s2 border-t border-surface-3 bg-white px-s6 py-s5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onDismiss}
            className="border border-surface-3 bg-white shadow-sm"
          >
            Not now
          </Button>
          <Button
            type="button"
            variant="accent"
            size="md"
            onClick={onAllow}
          >
            Allow location
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sage"
    />
  );
}
