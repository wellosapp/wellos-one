'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

import type { FormBuilderSchema } from '../_schema-utils';

import { FormPreviewRenderer } from './FormPreviewRenderer';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  schema: FormBuilderSchema;
}

type Width = 'desktop' | 'mobile';

// Centered modal that renders the form via FormPreviewRenderer with a
// desktop/mobile width toggle. Mirrors the chrome pattern from
// IOSInstallModal — Esc + backdrop click + focus-trap-light (focus the
// close button on open so keyboard users have an anchor).
export function PreviewModal({ open, onClose, schema }: PreviewModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState<Width>('desktop');

  // Esc-to-close. Bound only when open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Body scroll lock while open so the underlying builder doesn't scroll
  // through the modal backdrop.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const innerMaxWidth = width === 'mobile' ? 380 : 720;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:py-s6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-preview-title"
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-[920px] flex-col overflow-hidden',
          'bg-surface-1 shadow-lg',
          'sm:rounded-2xl',
          'max-h-full sm:max-h-[92vh]',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s4">
          <h2 id="form-preview-title" className="t-display-md text-ink">
            Preview
          </h2>
          <div className="flex items-center gap-s3">
            <WidthToggle width={width} onChange={setWidth} />
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close preview"
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
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2/40 px-s4 py-s6">
          <div
            className="mx-auto w-full"
            style={{ maxWidth: `${innerMaxWidth}px` }}
          >
            <FormPreviewRenderer schema={schema} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-surface-3 bg-white px-s6 py-s3">
          <p className="t-caption text-ink-soft">
            This is what your clients will see when they fill out this form.
          </p>
        </footer>
      </div>
    </div>
  );
}

function WidthToggle({
  width,
  onChange,
}: {
  width: Width;
  onChange: (w: Width) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-surface-3 bg-white">
      {(['desktop', 'mobile'] as const).map((w) => {
        const selected = width === w;
        return (
          <button
            key={w}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(w)}
            className={cn(
              'inline-flex items-center gap-s2 px-s3 py-[7px] t-body-sm transition-colors duration-fast',
              selected
                ? 'bg-sage text-white'
                : 'bg-white text-ink hover:bg-surface-2',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            {w === 'desktop' ? <DesktopIcon /> : <MobileIcon />}
            <span className="capitalize">{w}</span>
          </button>
        );
      })}
    </div>
  );
}

function DesktopIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}
