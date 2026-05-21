// KpiCard — single KPI tile used in the overview's top strip.
//
// Visual structure (top-down):
//   - icon + label (sage 14px icon, ink-3 t-body-md label)
//   - serif numeric value, optional $ prefix or % suffix
//   - delta badge (TrendUp/TrendDown + pct + 'vs last week')
//   - absolutely positioned Sparkline in the bottom-right

import type { ReactNode } from 'react';
import { TrendUpIcon, TrendDownIcon } from '@/app/admin/_shell/icons';
import type { Delta } from './types';
import { Sparkline } from './Sparkline';

type KpiCardProps = {
  id: string;
  label: string;
  icon: ReactNode;
  value: number | null;
  unit?: '$' | '%';
  delta: Delta;
  sparkline: number[];
};

export function KpiCard({
  label,
  icon,
  value,
  unit,
  delta,
  sparkline,
}: KpiCardProps) {
  const displayValue =
    value === null
      ? '—'
      : unit === '$'
        ? `$${value.toLocaleString()}`
        : unit === '%'
          ? `${value}%`
          : value.toLocaleString();

  return (
    <div
      className="relative overflow-hidden rounded-md border border-line bg-surface p-s5"
      // `id` is provided for callers that want to anchor / scroll to a card,
      // but isn't rendered into the DOM directly to avoid id collisions when
      // the strip is reused on multiple pages.
    >
      <div className="flex items-center gap-s2 t-body-md text-ink-3">
        <span className="text-sage [&_svg]:h-[14px] [&_svg]:w-[14px]">
          {icon}
        </span>
        <span>{label}</span>
      </div>

      <div
        className="mt-s3 font-display text-[34px] leading-none text-ink"
        title={value === null ? 'No data available for this period' : undefined}
      >
        {displayValue}
      </div>

      <div className="mt-s3 flex items-center text-[12px]">
        {delta ? (
          <span
            className={`inline-flex items-center gap-[4px] font-semibold tabular-nums ${
              delta.dir === 'up' ? 'text-sage' : 'text-terracotta'
            }`}
          >
            {delta.dir === 'up' ? (
              <TrendUpIcon size={12} />
            ) : (
              <TrendDownIcon size={12} />
            )}
            {delta.pct.toFixed(1)}%
            <span className="ml-[4px] font-medium text-ink-4">
              vs last week
            </span>
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-[14px] right-[14px] opacity-50">
        <Sparkline values={sparkline} width={70} height={28} />
      </div>
    </div>
  );
}
