'use client';

// CalendarNowMarker — pulsing vertical line at the current minute. Recomputes
// every 60s so the indicator drifts forward as the day passes. Returns null
// when "now" falls outside the [startHour, startHour+totalHours] window.

import { useEffect, useState } from 'react';

interface CalendarNowMarkerProps {
  startHour: number;
  totalHours: number;
  pxPerHour: number;
  nameColumnWidth: number;
}

function minutesSinceMidnightNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatNowLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

export function CalendarNowMarker({
  startHour,
  totalHours,
  pxPerHour,
  nameColumnWidth,
}: CalendarNowMarkerProps) {
  const [minutes, setMinutes] = useState<number>(() =>
    minutesSinceMidnightNow(),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutes(minutesSinceMidnightNow());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const startMin = startHour * 60;
  const endMin = (startHour + totalHours) * 60;
  if (minutes < startMin || minutes > endMin) return null;

  const offsetHours = (minutes - startMin) / 60;
  const left = nameColumnWidth + offsetHours * pxPerHour;
  const label = formatNowLabel(minutes);

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-[6]"
      style={{ left, width: 0 }}
      aria-label="Current time"
    >
      {/* Vertical line */}
      <span
        className="absolute inset-y-0 block w-[2px] bg-terracotta"
        style={{ left: -1 }}
      />
      {/* Pulsing dot at the top */}
      <span
        className="absolute block h-[10px] w-[10px] animate-pulse rounded-full bg-terracotta ring-2 ring-surface"
        style={{ top: -4, left: -5 }}
      />
      {/* Label pill */}
      <span
        className="absolute whitespace-nowrap rounded-sm border border-line bg-surface px-[5px] py-[1px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-terracotta shadow-sm"
        style={{ top: -22, left: 8 }}
      >
        NOW · {label}
      </span>
    </div>
  );
}
