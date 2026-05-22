'use client';

import { cn } from '@/lib/cn';

interface CalendarFilterPillsProps {
  /** `toolbar` shows the full pill row; `rail` shows a status line + the row. */
  variant?: 'toolbar' | 'rail';
}

type PillKey = 'all' | 'groups' | 'privates' | 'first-time' | 'conflicts';

const PILLS: { key: PillKey; label: string; comingSoon: boolean }[] = [
  // Only `All` is wired today (no-filter default). The other four depend on
  // backing data (group flag, first-time field, conflict surface) that isn't
  // on main yet — render dimmed with "Coming soon" tooltip until they land.
  { key: 'all', label: 'All', comingSoon: false },
  { key: 'groups', label: 'Groups', comingSoon: true },
  { key: 'privates', label: 'Privates', comingSoon: true },
  { key: 'first-time', label: 'First-time', comingSoon: true },
  { key: 'conflicts', label: 'Conflicts', comingSoon: true },
];

export function CalendarFilterPills({
  variant = 'toolbar',
}: CalendarFilterPillsProps) {
  return (
    <div className="flex flex-col gap-s2">
      {variant === 'rail' && (
        <span className="t-eyebrow text-ink-soft">Filter · showing all</span>
      )}
      <div className="flex flex-wrap items-center gap-s2">
        {PILLS.map((p) => {
          const isActive = p.key === 'all';
          const isDisabled = p.comingSoon;
          return (
            <button
              key={p.key}
              type="button"
              disabled={isDisabled}
              title={isDisabled ? 'Coming soon' : undefined}
              aria-pressed={isActive}
              className={cn(
                'rounded-sm border px-s3 py-[6px] t-caption font-semibold transition-colors duration-fast',
                isActive
                  ? 'border-ink bg-ink text-white'
                  : 'border-surface-3 bg-white text-ink hover:bg-surface-2',
                isDisabled && 'cursor-not-allowed opacity-50 hover:bg-white',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
