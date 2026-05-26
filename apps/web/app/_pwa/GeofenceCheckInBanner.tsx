'use client';

// Visible UX for the geofence auto check-in flow (PR 9). Mounted ONCE at
// root (alongside GeofenceCheckInProvider) so it self-gates on pathname
// and only renders on client-facing surfaces (/book, /me, /manage).
//
// State → render mapping (driven by useGeofenceCheckIn().state.kind):
//
//   idle | no-eligible-bookings  → null
//   permission-needed             → "You're booked for X — allow location?" + CTA
//   permission-denied             → "Enable in browser settings" + permissions link
//   polling                       → "Looking for you near {location}…" + manual button
//   checking-in                   → "Checking you in…" spinner
//   checked-in                    → success card + dismiss
//   error                         → message + retry (when retryable)
//
// The banner is sticky at the top of the viewport with a z-index above
// page content but below the modal overlay (z-50). It coexists with the
// InstallPromptBanner which is laid out inline elsewhere — no stacking
// collision because the install banner doesn't use fixed positioning.

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { useGeofenceCheckIn } from './GeofenceCheckInProvider';
import { GeofencePermissionModal } from './GeofencePermissionModal';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

function minutesUntil(iso: string): number {
  const ms = Date.parse(iso) - Date.now();
  return Math.max(0, Math.round(ms / 60_000));
}

function formatStartCue(iso: string): string {
  const mins = minutesUntil(iso);
  if (mins <= 0) return 'starting now';
  if (mins === 1) return 'in 1 minute';
  if (mins < 60) return `in ${mins} minutes`;
  // For windows extending past an hour, fall back to a clock time.
  return `at ${new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function GeofenceCheckInBanner() {
  const { state, requestPermissionAndStart, submitManualCheckIn, dismissChecked } =
    useGeofenceCheckIn();
  const [modalOpen, setModalOpen] = useState(false);

  // Hard noop when the flag is off — the provider already noops but the
  // banner is rendered unconditionally from layout, so a second gate here
  // saves a wasted render path on every navigation.
  if (!PWA_ENABLED) return null;

  if (state.kind === 'idle' || state.kind === 'no-eligible-bookings') {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'sticky top-0 z-40 flex justify-center px-s4 pt-s3',
          // Subtle drop so the banner separates from the header on scroll.
          'pointer-events-none',
        )}
        aria-live="polite"
      >
        <div className="pointer-events-auto w-full max-w-[640px]">
          <BannerContent
            state={state}
            onAllow={() => setModalOpen(true)}
            onManual={() => {
              void submitManualCheckIn();
            }}
            onDismiss={dismissChecked}
          />
        </div>
      </div>

      <GeofencePermissionModal
        open={modalOpen}
        onAllow={() => {
          setModalOpen(false);
          requestPermissionAndStart();
        }}
        onDismiss={() => setModalOpen(false)}
        className={
          state.kind === 'permission-needed' ||
          state.kind === 'permission-denied' ||
          state.kind === 'polling' ||
          state.kind === 'checking-in' ||
          state.kind === 'checked-in' ||
          state.kind === 'error'
            ? state.booking.className
            : undefined
        }
      />
    </>
  );
}

interface BannerContentProps {
  state: ReturnType<typeof useGeofenceCheckIn>['state'];
  onAllow: () => void;
  onManual: () => void;
  onDismiss: () => void;
}

function BannerContent({
  state,
  onAllow,
  onManual,
  onDismiss,
}: BannerContentProps) {
  switch (state.kind) {
    case 'permission-needed':
      return (
        <Shell tone="sage">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
            <BannerCopy
              icon={<PinIcon />}
              title={`You're booked for ${state.booking.className}`}
              body={`Starts ${formatStartCue(state.booking.scheduledStartAt)}. Allow location to check in when you arrive.`}
            />
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={onAllow}
              className="shrink-0"
            >
              Allow location
            </Button>
          </div>
        </Shell>
      );

    case 'permission-denied':
      return (
        <Shell tone="neutral">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
            <BannerCopy
              icon={<PinIcon />}
              title="Location access needed"
              body="Enable location in your browser settings, then refresh to auto check-in."
            />
            <Link
              href={'/me/permissions' as Route}
              className={cn(
                'inline-flex shrink-0 items-center justify-center self-start rounded-md',
                'border border-surface-3 bg-white px-s4 py-s2 t-body-sm font-medium text-ink',
                'shadow-sm transition-colors hover:bg-surface-2',
                'focus-visible:shadow-focus focus-visible:outline-none',
              )}
            >
              Manage permissions
            </Link>
          </div>
        </Shell>
      );

    case 'polling':
      return (
        <Shell tone="sage">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
            <BannerCopy
              icon={<Spinner />}
              title={`Looking for you near ${state.booking.locationName}…`}
              body="We'll check you in automatically when you arrive."
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onManual}
              className="shrink-0 border border-surface-3 bg-white shadow-sm"
            >
              I&apos;m here — check me in
            </Button>
          </div>
        </Shell>
      );

    case 'checking-in':
      return (
        <Shell tone="sage">
          <BannerCopy
            icon={<Spinner />}
            title="Checking you in…"
            body={`For ${state.booking.className} at ${state.booking.locationName}.`}
          />
        </Shell>
      );

    case 'checked-in':
      return (
        <Shell tone="sage">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
            <BannerCopy
              icon={<CheckIcon />}
              title={`Checked in for ${state.booking.className} — enjoy!`}
              body={`At ${state.booking.locationName}. See you inside.`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="shrink-0 border border-surface-3 bg-white shadow-sm"
            >
              Dismiss
            </Button>
          </div>
        </Shell>
      );

    case 'error':
      return (
        <Shell tone="warning">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
            <BannerCopy
              icon={<AlertIcon />}
              title="Couldn't check you in"
              body={
                state.code === 'TOKEN_EXPIRED' ||
                state.code === 'OUT_OF_WINDOW' ||
                state.code === 'TOKEN_REVOKED' ||
                state.code === 'INVALID_TOKEN'
                  ? `${state.message} Ask the front desk to check you in.`
                  : state.message
              }
            />
            {state.retryable ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={onManual}
                className="shrink-0"
              >
                Try again
              </Button>
            ) : null}
          </div>
        </Shell>
      );

    // idle / no-eligible-bookings are filtered upstream — render null here
    // just to satisfy exhaustiveness.
    case 'idle':
    case 'no-eligible-bookings':
    default:
      return null;
  }
}

type ShellTone = 'sage' | 'neutral' | 'warning';

function Shell({
  tone,
  children,
}: {
  tone: ShellTone;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-s4 shadow-sm backdrop-blur-sm sm:p-s5',
        tone === 'sage' && 'border-sage/30 bg-sage-tint text-ink',
        tone === 'neutral' && 'border-surface-3 bg-surface-2 text-ink',
        tone === 'warning' && 'border-amber-pale bg-amber-pale text-ink',
      )}
      role="status"
    >
      {children}
    </div>
  );
}

function BannerCopy({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-s3">
      <span
        aria-hidden
        className="mt-s1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage text-white"
      >
        {icon}
      </span>
      <div className="flex flex-col gap-s1">
        <strong className="t-body-lg font-semibold text-ink">{title}</strong>
        <p className="t-body-sm text-ink-soft">{body}</p>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 9v4M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
