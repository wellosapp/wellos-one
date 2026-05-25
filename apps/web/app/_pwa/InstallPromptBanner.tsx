'use client';

// Reusable PWA install banner. Used in two surfaces so far (see `surface`
// prop): booking confirmation (warm sage tint) and returning client on
// /book (neutral tint). Dismissal is per-surface in localStorage and
// permanent until the user re-triggers via /me/permissions (PR 3).
//
// Visibility gates, ALL must pass before we render anything:
//   1. PwaInstallProvider has mounted (no SSR mismatch)
//   2. `NEXT_PUBLIC_PWA_ENABLED` is on (via canPromptInstall in context)
//   3. Not running in standalone mode (would be embarrassing — they're
//      already inside the installed PWA)
//   4. Not previously dismissed for this surface (localStorage flag)
//   5. Either a native prompt is available OR we're on iOS Safari (the
//      A2HS modal fallback path)
//   6. For the returning-client surface only: the visitor flag was set on
//      a PRIOR visit (otherwise this is their first /book load and the
//      banner is too aggressive)

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { IOSInstallModal } from './IOSInstallModal';
import { usePwaInstall } from './PwaInstallProvider';

export type InstallPromptSurface =
  | 'booking-confirmation'
  | 'returning-client';

interface InstallPromptBannerProps {
  surface: InstallPromptSurface;
  /** Visual tone. Defaults align with the spec — sage for confirmation,
   *  neutral for the returning-client placement. */
  tone?: 'sage' | 'neutral';
}

const DISMISS_KEY: Record<InstallPromptSurface, string> = {
  'booking-confirmation': 'wellos.pwa.banner-dismissed.booking-confirmation',
  'returning-client': 'wellos.pwa.banner-dismissed.returning-client',
};

const COPY: Record<InstallPromptSurface, { title: string; body: string }> = {
  'booking-confirmation': {
    title: 'Install Wellos on your phone',
    body: 'Get class reminders and auto check-in at the studio.',
  },
  'returning-client': {
    title: 'Install Wellos for the best experience',
    body: 'Faster bookings and class reminders, one tap from your home screen.',
  },
};

const VISITED_KEY = 'wellos.has-visited';

export function InstallPromptBanner({
  surface,
  tone = surface === 'booking-confirmation' ? 'sage' : 'neutral',
}: InstallPromptBannerProps) {
  const {
    mounted,
    canPromptInstall,
    canInstallNative,
    isIOSSafari,
    isStandalone,
    promptNativeInstall,
  } = usePwaInstall();

  // dismissed: starts undefined (not-yet-read from localStorage). Once
  // read, it's either true (hide) or false (show). Tri-state lets the
  // banner render nothing on the first paint while we settle.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);
  const [hasPriorVisit, setHasPriorVisit] = useState<boolean | undefined>(
    undefined,
  );
  const [iosModalOpen, setIosModalOpen] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    try {
      const v = window.localStorage.getItem(DISMISS_KEY[surface]);
      setDismissed(v === 'true');
    } catch {
      // localStorage can throw in private mode / quota / disabled. Default
      // to "show" so users still see the banner; dismissal just won't
      // persist across reloads, which is acceptable.
      setDismissed(false);
    }
  }, [mounted, surface]);

  useEffect(() => {
    if (!mounted) return;
    if (surface !== 'returning-client') {
      setHasPriorVisit(true); // not applicable; treat as gate-passed
      return;
    }
    try {
      setHasPriorVisit(window.localStorage.getItem(VISITED_KEY) === 'true');
    } catch {
      setHasPriorVisit(false);
    }
  }, [mounted, surface]);

  const handleInstall = async () => {
    if (canInstallNative) {
      const outcome = await promptNativeInstall();
      // If the user dismissed the native prompt, treat that as "maybe
      // later" for THIS surface so we don't immediately re-prompt them
      // on the next render. (appinstalled hides the banner already.)
      if (outcome === 'dismissed') {
        persistDismissal(surface, setDismissed);
      }
      return;
    }
    if (isIOSSafari) {
      setIosModalOpen(true);
    }
  };

  const handleMaybeLater = () => {
    persistDismissal(surface, setDismissed);
  };

  // Gate ordering — bail in cheapest-first order.
  if (!mounted) return null;
  if (!canPromptInstall) return null;
  if (isStandalone) return null;
  if (dismissed !== false) return null;
  if (surface === 'returning-client' && hasPriorVisit !== true) return null;

  const isSage = tone === 'sage';

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border p-s4 sm:p-s5',
          isSage
            ? 'border-sage/30 bg-sage-tint text-ink'
            : 'border-surface-3 bg-surface-2 text-ink',
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col gap-s3 sm:flex-row sm:items-start sm:justify-between sm:gap-s4">
          <div className="flex items-start gap-s3">
            <span
              aria-hidden
              className={cn(
                'mt-s1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                isSage ? 'bg-sage text-white' : 'bg-accent-pale text-accent',
              )}
            >
              <PhoneIcon />
            </span>
            <div className="flex flex-col gap-s1">
              <strong className="t-body-lg font-semibold text-ink">
                {COPY[surface].title}
              </strong>
              <p className="t-body-sm text-ink-soft">{COPY[surface].body}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-s2 sm:flex-col sm:items-stretch sm:gap-s2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => void handleInstall()}
            >
              Install
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMaybeLater}
              className="border border-surface-3 bg-white shadow-sm"
            >
              Maybe later
            </Button>
          </div>
        </div>
        {/* Discovery hook for /me/permissions. Only surfaced on the
            returning-client banner — the booking-confirmation surface is
            its own bounded moment and shouldn't fork attention. */}
        {surface === 'returning-client' ? (
          <div className="mt-s3 flex justify-end">
            <Link
              href={'/me/permissions' as Route}
              className="t-body-sm text-ink-soft no-underline hover:text-ink focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
            >
              Manage permissions →
            </Link>
          </div>
        ) : null}
      </div>

      <IOSInstallModal
        open={iosModalOpen}
        onClose={() => setIosModalOpen(false)}
      />
    </>
  );
}

function persistDismissal(
  surface: InstallPromptSurface,
  setDismissed: (v: boolean) => void,
) {
  setDismissed(true);
  try {
    window.localStorage.setItem(DISMISS_KEY[surface], 'true');
  } catch {
    // Silent — banner is still hidden in this session, just won't persist.
  }
}

function PhoneIcon() {
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
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}
