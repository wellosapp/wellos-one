'use client';

import { useEffect, useState } from 'react';

interface CalendarNowMarkerProps {
  /** First visible hour of the river (e.g. 7 for 7am). */
  startHour: number;
  /** Total hours rendered (e.g. 13 for 7am–8pm). */
  totalHours: number;
  pxPerHour: number;
  /** Width of the sticky staff-name column; marker x is offset by this. */
  nameColumnWidth: number;
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function formatNowPill(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pulsing NOW line: dot + 2px vertical bar + label pill. Re-ticks every
 * minute via setInterval(60_000). Auto-hides outside the river's [startHour,
 * startHour + totalHours] window. Tone: bg-red/text-red on main maps to the
 * design's terracotta when the shell PR's expanded palette merges.
 */
export function CalendarNowMarker({
  startHour,
  totalHours,
  pxPerHour,
  nameColumnWidth,
}: CalendarNowMarkerProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const minsNow = minutesSinceMidnight(now);
  const startMin = startHour * 60;
  const endMin = (startHour + totalHours) * 60;
  if (minsNow < startMin || minsNow > endMin) return null;

  const x = nameColumnWidth + ((minsNow - startMin) / 60) * pxPerHour;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-30"
      style={{ left: x }}
      aria-label={`Current time ${formatNowPill(now)}`}
    >
      <span
        className="absolute -left-7 -top-3 rounded-sm bg-red px-s2 py-[2px] text-[10px] font-mono font-bold uppercase tracking-wider text-white shadow-sm"
        // tone(shell-pr): red → terracotta once the design token lands.
      >
        Now · {formatNowPill(now)}
      </span>
      <div className="absolute inset-y-0 left-0 w-[2px] -translate-x-1/2 bg-red opacity-90" />
      <div
        className="absolute -left-[5px] top-0 h-[10px] w-[10px] rounded-full bg-red shadow-sm animate-pulse"
        aria-hidden="true"
      />
    </div>
  );
}
