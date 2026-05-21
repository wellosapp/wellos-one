// RevenueChart — inline-SVG dual-line chart showing this week's daily
// revenue vs the prior week. Straight-line segments (no curve smoothing
// in MVP). Five horizontal gridlines, dashed prior-week trace, solid
// current-week trace + soft sage fill under it.

import { TrendUpIcon, TrendDownIcon } from '@/app/admin/_shell/icons';
import type { RevenueChartData } from './types';

type RevenueChartProps = RevenueChartData & {
  className?: string;
};

const W = 600;
const H = 200;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 28;

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatGridLabel(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(v)}`;
}

export function RevenueChart({
  weekOf,
  currentWeek,
  priorWeek,
  total,
  deltaPct,
  className,
}: RevenueChartProps) {
  const series = [...currentWeek, ...priorWeek];
  const rawMax = series.length > 0 ? Math.max(...series) : 0;
  // Round up to the nearest $500 so gridline labels read cleanly. Floor
  // at 500 to keep an empty/zero week from collapsing the y-axis.
  const maxV = Math.max(500, Math.ceil(rawMax / 500) * 500);
  const pointCount = Math.max(currentWeek.length, priorWeek.length, 1);
  const step = pointCount > 1 ? (W - PAD_L - PAD_R) / (pointCount - 1) : 0;
  const x = (i: number) => PAD_L + i * step;
  const y = (v: number) => PAD_T + (1 - v / maxV) * (H - PAD_T - PAD_B);

  const linePath = (arr: number[]) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`)
      .join(' ');

  const areaPath = (arr: number[]) => {
    if (arr.length === 0) return '';
    return (
      `M ${PAD_L} ${H - PAD_B} ` +
      arr.map((v, i) => `L ${x(i)} ${y(v)}`).join(' ') +
      ` L ${x(arr.length - 1)} ${H - PAD_B} Z`
    );
  };

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const deltaUp = deltaPct !== null && deltaPct >= 0;

  return (
    <section
      className={`flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm ${className ?? ''}`}
    >
      <header className="flex items-center gap-s3">
        <div className="flex flex-col gap-[2px]">
          <span className="t-eyebrow text-sage">Revenue</span>
          <h3 className="t-display-md text-ink">Week of {weekOf}</h3>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-s4 text-[11.5px] text-ink-3">
          <span className="inline-flex items-center gap-[6px]">
            <span className="inline-block h-[8px] w-[8px] rounded-[2px] bg-sage" />
            This week
          </span>
          <span className="inline-flex items-center gap-[6px]">
            <span className="inline-block h-[8px] w-[8px] rounded-[2px] bg-ink-4" />
            Prior week
          </span>
        </div>
      </header>

      <div className="relative h-[200px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-full w-full"
          aria-label={`Revenue chart for week of ${weekOf}`}
        >
          {/* Gridlines + y-axis labels */}
          {gridTicks.map((t) => {
            const yy = PAD_T + t * (H - PAD_T - PAD_B);
            const v = Math.round(maxV * (1 - t));
            return (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yy}
                  y2={yy}
                  stroke="var(--line)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <text
                  x={PAD_L - 6}
                  y={yy + 3}
                  textAnchor="end"
                  className="fill-ink-4 font-mono"
                  style={{ fontSize: 10 }}
                >
                  {formatGridLabel(v)}
                </text>
              </g>
            );
          })}

          {/* Day labels */}
          {DAY_LABELS.map((d, i) => (
            <text
              key={d}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-ink-4"
              style={{ fontSize: 10 }}
            >
              {d}
            </text>
          ))}

          {/* Prior week — dashed */}
          {priorWeek.length > 0 ? (
            <path
              d={linePath(priorWeek)}
              fill="none"
              stroke="var(--ink-4)"
              strokeWidth={1.2}
              strokeDasharray="3 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* Current week — area + solid line + dots */}
          {currentWeek.length > 0 ? (
            <>
              <path d={areaPath(currentWeek)} fill="var(--sage-tint)" />
              <path
                d={linePath(currentWeek)}
                fill="none"
                stroke="var(--sage)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {currentWeek.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={3}
                  fill="var(--sage)"
                />
              ))}
            </>
          ) : null}
        </svg>
      </div>

      <div className="flex items-center gap-s3 t-body-md">
        <span className="font-semibold text-ink tabular-nums">
          ${total.toLocaleString()}
        </span>
        {deltaPct === null ? (
          <span className="text-ink-4">&mdash;</span>
        ) : (
          <span
            className={`inline-flex items-center gap-[4px] font-semibold tabular-nums ${
              deltaUp ? 'text-sage' : 'text-terracotta'
            }`}
          >
            {deltaUp ? (
              <TrendUpIcon size={12} />
            ) : (
              <TrendDownIcon size={12} />
            )}
            {Math.abs(deltaPct).toFixed(1)}%
            <span className="ml-[4px] font-medium text-ink-4">
              vs prior week
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
