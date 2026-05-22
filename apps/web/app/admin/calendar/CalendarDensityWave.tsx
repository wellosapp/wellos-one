import { cn } from '@/lib/cn';

interface CalendarDensityWaveProps {
  bins: { hour: number; count: number }[];
  startHour: number;
  pxPerHour: number;
  nameColumnWidth: number;
  className?: string;
}

const HEIGHT = 56;
const BIN_MINUTES = 30;
const TOP_PAD = 6;
const BOTTOM_PAD = 2;

/**
 * Catmull-Rom → cubic Bezier path through density points. Tension 0.5.
 * Returns a closed area path (line down to baseline) ready for <path d=…/>.
 */
function smoothedAreaPath(
  points: { x: number; y: number }[],
  baseY: number,
): { stroke: string; fill: string } {
  if (points.length === 0) return { stroke: '', fill: '' };
  if (points.length === 1) {
    const p = points[0]!;
    return {
      stroke: `M ${p.x} ${p.y}`,
      fill: `M ${p.x} ${baseY} L ${p.x} ${p.y} L ${p.x} ${baseY} Z`,
    };
  }

  let stroke = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    stroke += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const fill = `${stroke} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
  return { stroke, fill };
}

/**
 * Density wave aligned with the river grid below. Renders an SVG sized to
 * (nameColumnWidth + (total hours) × pxPerHour) — the first nameColumnWidth
 * pixels are intentionally empty so the curve starts exactly at the first
 * hour cell of the grid.
 */
export function CalendarDensityWave({
  bins,
  startHour,
  pxPerHour,
  nameColumnWidth,
  className,
}: CalendarDensityWaveProps) {
  if (bins.length === 0) return null;

  // Map (hour, count) → (x, y). x is offset by nameColumnWidth.
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const yFor = (count: number): number => {
    const pct = count / maxCount;
    const usable = HEIGHT - TOP_PAD - BOTTOM_PAD;
    return TOP_PAD + (1 - pct) * usable;
  };

  const points = bins.map((b) => {
    const x = nameColumnWidth + (b.hour - startHour) * pxPerHour;
    return { x, y: yFor(b.count) };
  });

  const lastBin = bins[bins.length - 1]!;
  const totalWidth =
    nameColumnWidth + (lastBin.hour + BIN_MINUTES / 60 - startHour) * pxPerHour;

  const { stroke, fill } = smoothedAreaPath(points, HEIGHT - BOTTOM_PAD);

  return (
    <div className={cn('overflow-hidden', className)}>
      <svg
        width={totalWidth}
        height={HEIGHT}
        viewBox={`0 0 ${totalWidth} ${HEIGHT}`}
        aria-hidden="true"
        className="block"
      >
        <path d={fill} className="fill-accent-pale opacity-60" />
        <path
          d={stroke}
          className="stroke-accent"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
