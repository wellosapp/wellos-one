'use client';

import type { Route } from 'next';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/cn';

// Right-side drawer panel. URL-driven: the parent decides when to render
// (presence of the trigger searchParam) and passes a `closeHref` that drops
// that param. Esc + overlay click both call router.push(closeHref) so the
// browser History entry stays linkable. No portal — fixed positioning is
// fine for the single drawer we render at a time.
//
// Why URL state over local React state: it survives reload, supports deep-
// links, and avoids client-component-only fetching for the drawer body
// (the parent server component re-fetches the selected appointment when the
// param changes, which keeps tabs streaming-friendly).

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  // Optional render slot for header actions (e.g. status pill, close-and-do).
  headerActions?: ReactNode;
  widthClassName?: string;
  ariaLabel?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  widthClassName = 'w-full max-w-[520px]',
  ariaLabel,
}: DrawerProps) {
  // Esc-to-close. Bound only when open to avoid leaking a global listener.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock while open so the calendar grid doesn't jiggle behind
  // the drawer on touchpads.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        aria-label="Close drawer overlay"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px] transition-opacity duration-base"
      />
      <aside
        className={cn(
          'absolute right-0 top-0 flex h-full flex-col bg-white shadow-lg',
          widthClassName,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-s4 border-b border-surface-3 px-s6 py-s4">
          <div className="flex flex-col gap-s1">
            {typeof title === 'string' ? (
              <h2 className="t-display-md text-ink">{title}</h2>
            ) : (
              title
            )}
            {subtitle && (
              <div className="t-body-sm text-ink-soft">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-s2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-soft',
                'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
                'focus-visible:outline-none focus-visible:shadow-focus',
              )}
              aria-label="Close drawer"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

// URL-driven helper: pushes a Link the parent can render to close the drawer.
// Caller supplies the closeHref so the search-param manipulation stays
// owned by the parent component (which knows what other params to preserve).
export function useDrawerCloseRouter(closeHref: string): () => void {
  const router = useRouter();
  // Next's typedRoutes can't infer runtime hrefs; cast.
  return () => router.push(closeHref as Route);
}
