'use client';

import { cn } from '@/lib/cn';

interface FormProgressBarProps {
  /** 1-indexed current page (synthetic General page counts as page 1). */
  current: number;
  total: number;
  className?: string;
}

// Slim progress bar at the top of the public form completion view. Communicates
// "you're X of Y pages in" without taking too much of the mobile viewport.
export function FormProgressBar({ current, total, className }: FormProgressBarProps) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));
  return (
    <div className={cn('flex flex-col gap-s2', className)}>
      <div className="flex items-baseline justify-between">
        <span className="t-caption text-ink-soft">
          Step {Math.min(current, safeTotal)} of {safeTotal}
        </span>
        <span className="t-caption text-ink-soft">{Math.round(ratio * 100)}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={Math.min(current, safeTotal)}
      >
        <div
          className="h-full bg-sage-deep transition-[width] duration-base"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
