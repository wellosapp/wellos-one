// RevenueChart — fluid dual-line chart showing this week's daily
// revenue vs the prior week. The SVG holds only the gridlines + the
// line/area paths + the dot markers and stretches with `preserveAspect
// Ratio="none"` so it fills the container's width. The y-axis dollar
// labels + x-axis day labels render as HTML overlays positioned
// absolutely over the SVG plot area — that keeps the text at native
// pixel size at every container width instead of stretching with the
// non-uniform SVG scale.

import { TrendUpIcon, TrendDownIcon } from '@/app/admin/_shell/icons';
import type { RevenueChartData } from './types';

type RevenueChartProps = RevenueChartData & {
  className?: string;
};

// SVG viewBox dimensions. The aspect ratio doesn't have to match the
// rendered container — preserveAspectRatio="none" stretches both axes
// to fill, and labels are HTML so they don't follow the stretch.
const W = 600;
const H = 200;
// PAD_L is the left-side reserved space for the y-axis labels (absolute
// HTML, sized in px). Keeping it in the same numeric world as the
// viewBox is convenient — the chart's plot area runs from PAD_L to
// W - PAD_R in viewBox units AND from `${PAD_L_PX}px` to right-edge
// in CSS units. Because both axes stretch identically, the absolute
// percent positions for HTML overlays line up with the SVG plot points.
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 30;

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

  // Percent positions for HTML label overlays. These mirror the SVG
  // padding so the labels land on the gridlines / plot points regardless
  // of container width.
  const leftPctFor = (i: number) => ((PAD_L + i * step) / W) * 100;
  const yPctFor = (tickFrac: number) =>
    ((PAD_T + tickFrac * (H - PAD_T - PAD_B)) / H) * 100;

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

      <div className="relative h-[200px] w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 block h-full w-full"
          aria-label={`Revenue chart for week of ${weekOf}`}
        >
          {/* Gridlines only — labels render as HTML overlays below to
              avoid getting stretched with the non-uniform SVG scale. */}
          {gridTicks.map((t) => {
            const yy = PAD_T + t * (H - PAD_T - PAD_B);
            return (
              <line
                key={t}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yy}
                y2={yy}
                stroke="var(--line)"
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

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
              vectorEffect="non-scaling-stroke"
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
                vectorEffect="non-scaling-stroke"
              />
              {currentWeek.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={3}
                  fill="var(--sage)"
                  // Without vector-effect, the circle would also distort
                  // horizontally with the stretched SVG. Non-scaling-stroke
                  // doesn't apply to fills; using `<rect>` with
                  // non-scaling transform would, but small dots are
                  // tolerable as ovals at extreme widths. Acceptable for
                  // MVP — revisit if dot distortion becomes visible.
                />
              ))}
            </>
          ) : null}
        </svg>

        {/* HTML overlay: y-axis $ labels. Native px sizing — never stretches. */}
        <div className="pointer-events-none absolute inset-0">
          {gridTicks.map((t) => {
            const v = Math.round(maxV * (1 - t));
            return (
              <span
                key={t}
                className="absolute font-mono text-[10px] leading-none text-ink-4"
                style={{
                  top: `${yPctFor(t)}%`,
                  left: 0,
                  width: `${PAD_L - 8}px`,
                  textAlign: 'right',
                  transform: 'translateY(-50%)',
                }}
              >
                {formatGridLabel(v)}
              </span>
            );
          })}
        </div>

        {/* HTML overlay: x-axis day labels. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[20px]">
          {DAY_LABELS.slice(0, pointCount).map((d, i) => (
            <span
              key={d}
              className="absolute text-[10px] leading-none text-ink-4"
              style={{
                left: `${leftPctFor(i)}%`,
                bottom: 0,
                transform: 'translateX(-50%)',
              }}
            >
              {d}
            </span>
          ))}
        </div>
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
