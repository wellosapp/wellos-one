'use client';

// Three-step "Add to Home Screen" modal for iOS Safari, which doesn't fire
// beforeinstallprompt. Hand-drawn SVGs only — no real iOS screenshots
// (lighter bundle, easier to keep matching the design vocab, avoids
// trademark concerns).
//
// Why a custom modal instead of the shared Drawer primitive: Drawer is a
// right-side panel for admin workflows. This is a centered three-step
// instructional dialog on a client-facing surface — different visual
// contract. Kept minimal: backdrop click + Esc + focus-visible close.

import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

interface IOSInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function IOSInstallModal({ open, onClose }: IOSInstallModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc-to-close. Bound only when open so we don't leak a global listener.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the close button on open so Esc users have a keyboard anchor.
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
      aria-labelledby="ios-install-title"
    >
      <button
        type="button"
        aria-label="Close install instructions"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-lg sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <h2 id="ios-install-title" className="t-display-md text-ink">
              Install Wellos
            </h2>
            <span className="t-body-sm text-ink-soft">
              Add Wellos to your home screen.
            </span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
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
          <ol className="flex flex-col gap-s4">
            <Step n={1} icon={<ShareIcon />}>
              Tap the share button in your browser.
            </Step>
            <Step n={2} icon={<PlusSquareIcon />}>
              Scroll down and tap{' '}
              <strong className="font-semibold text-ink">
                Add to Home Screen
              </strong>
              .
            </Step>
            <Step n={3} icon={<CheckIcon />}>
              Tap <strong className="font-semibold text-ink">Add</strong>.
            </Step>
          </ol>

          <p className="mt-s5 t-body-sm text-ink-soft">
            Wellos opens like a regular app once installed.
          </p>
        </div>

        <footer className="shrink-0 border-t border-surface-3 bg-white px-s6 py-s5">
          <Button
            type="button"
            variant="accent"
            size="md"
            className="w-full"
            onClick={onClose}
          >
            Got it
          </Button>
        </footer>
      </div>
    </div>
  );
}

// Step row — sage step-circle + icon + copy. Matches the design's editorial
// stroke vocabulary (stroke 1.6, currentColor, 24x24 viewBox) so the
// instructional icons read as the same family as admin icons.tsx.
function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-s4">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage text-white t-body-sm font-semibold"
      >
        {n}
      </span>
      <span className="mt-s1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-ink-soft">
        {icon}
      </span>
      <span className="t-body-md text-ink">{children}</span>
    </li>
  );
}

// Inline SVGs. Stroke 1.6, currentColor — same vocabulary as the admin
// icon set so the modal reads as native to the design system.

function ShareIcon() {
  // iOS-style share glyph: square with an up-arrow rising out of it.
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v13M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}
