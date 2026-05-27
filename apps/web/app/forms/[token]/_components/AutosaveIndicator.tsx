'use client';

import { cn } from '@/lib/cn';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  className?: string;
}

// Tiny "draft saved" pill below the field stack. Communicates the autosave
// heartbeat without stealing focus from the form itself.
export function AutosaveIndicator({ status, className }: AutosaveIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  const tone =
    status === 'error'
      ? 'text-red'
      : status === 'saving'
      ? 'text-ink-soft'
      : 'text-sage-deep';

  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'saved'
      ? 'Draft saved'
      : "Couldn't save — check your connection";

  return (
    <p
      className={cn(
        't-caption inline-flex items-center gap-s2 transition-opacity duration-base',
        tone,
        className,
      )}
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          status === 'saving' && 'bg-ink-soft animate-pulse',
          status === 'saved' && 'bg-sage-deep',
          status === 'error' && 'bg-red',
        )}
      />
      {label}
    </p>
  );
}
