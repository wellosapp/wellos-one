// Sparkline — purely presentational SVG polyline used inside KpiCard.
//
// Auto-scales y from min/max of the input series. Empty arrays render
// nothing (so the caller can safely pass `[]` for missing data without
// special-casing).

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
};

export function Sparkline({
  values,
  width = 70,
  height = 28,
  className,
}: SparklineProps) {
  if (values.length === 0) return null;
  if (values.length === 1) {
    // A single point can't be a polyline — draw a flat midline so the card
    // doesn't end up with a visually empty slot.
    const y = (height / 2).toFixed(1);
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width, height }}
        className={className}
        aria-hidden="true"
      >
        <polyline
          points={`0,${y} ${width},${y}`}
          fill="none"
          stroke="var(--sage)"
          strokeWidth={1.4}
          strokeOpacity={0.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(
          height -
          ((v - min) / span) * height
        ).toFixed(1)}`,
    )
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width, height }}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--sage)"
        strokeWidth={1.4}
        strokeOpacity={0.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
