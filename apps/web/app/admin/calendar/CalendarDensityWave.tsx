// CalendarDensityWave — informational area chart above the staff river. Renders
// a smooth curve over `bins` (30-min counts) so operators can see where the
// day is heavy at a glance. The first `nameColumnWidth` px is empty to align
// with the sticky name column of the grid below.

interface CalendarDensityBin {
  hour: number;
  count: number;
}

interface CalendarDensityWaveProps {
  bins: CalendarDensityBin[];
  startHour: number;
  pxPerHour: number;
  nameColumnWidth: number;
  className?: string;
}

const SVG_HEIGHT = 56;
const BASELINE_Y = 48;
const COUNT_PX_PER_UNIT = 8;
const MAX_AREA_HEIGHT = 38;

export function CalendarDensityWave({
  bins,
  startHour,
  pxPerHour,
  nameColumnWidth,
  className,
}: CalendarDensityWaveProps) {
  // Width derives from bins (assumed every 30 min) — half-hour step = pxPerHour / 2.
  const halfHourPx = pxPerHour / 2;
  const trackWidth = bins.length * halfHourPx;
  const totalWidth = nameColumnWidth + trackWidth;

  // Convert (binIndex, count) → (x, y). x is in the track region.
  const points: { x: number; y: number }[] = bins.map((bin, i) => {
    const x = nameColumnWidth + i * halfHourPx + halfHourPx / 2;
    const clampedHeight = Math.min(
      MAX_AREA_HEIGHT,
      bin.count * COUNT_PX_PER_UNIT,
    );
    return { x, y: BASELINE_Y - clampedHeight };
  });

  // Smooth path via Catmull-Rom → cubic Bezier conversion.
  let pathD = '';
  if (points.length > 0) {
    const first = points[0];
    if (first) {
      pathD = `M ${first.x.toFixed(2)} ${BASELINE_Y.toFixed(2)} L ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        if (!p0 || !p1 || !p2 || !p3) continue;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        pathD += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
      const last = points[points.length - 1];
      if (last) {
        pathD += ` L ${last.x.toFixed(2)} ${BASELINE_Y.toFixed(2)} Z`;
      }
    }
  }

  // Mark every hour on the baseline so the wave reads against the grid below.
  const hourTicks: number[] = [];
  for (let h = 0; h <= bins.length / 2; h++) {
    hourTicks.push(nameColumnWidth + h * pxPerHour);
  }

  return (
    <div className={className}>
      <svg
        width={totalWidth}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${totalWidth} ${SVG_HEIGHT}`}
        role="img"
        aria-label={`Day density between ${startHour}:00 and ${startHour + bins.length / 2}:00`}
        className="block"
      >
        {/* Baseline */}
        <line
          x1={nameColumnWidth}
          x2={totalWidth}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          className="stroke-line"
          strokeWidth={1}
        />
        {/* Hour ticks (faint) */}
        {hourTicks.map((x, i) => (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={BASELINE_Y - 4}
            y2={BASELINE_Y}
            className="stroke-line-soft"
            strokeWidth={1}
          />
        ))}
        {/* Area + stroke */}
        {pathD ? (
          <>
            <path d={pathD} className="fill-sage" opacity={0.18} />
            <path
              d={pathD}
              className="stroke-sage"
              strokeWidth={1.5}
              fill="none"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}
