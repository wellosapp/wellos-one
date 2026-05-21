'use client';

import { Button } from '@/components/ui';

interface SuccessCardProps {
  token: string;
  title: string;
  body: string;
  /** Optional CTA back-label override. Defaults to "Back to appointment". */
  backLabel?: string;
}

export function SuccessCard({ token, title, body, backLabel }: SuccessCardProps) {
  return (
    <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <div className="flex items-center gap-s3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-pale text-accent"
          aria-hidden
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span className="t-eyebrow text-accent">Done</span>
      </div>
      <h1 className="mt-s3 t-display-md text-ink">{title}</h1>
      <p className="mt-s3 t-body-md text-ink-soft">{body}</p>
      <div className="mt-s6">
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
            {backLabel ?? 'Back to appointment'}
          </Button>
        </a>
      </div>
    </div>
  );
}
