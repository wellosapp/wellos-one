import { cn } from '@/lib/cn';

export interface StaffLoadRow {
  staffId: string;
  firstName: string;
  lastName: string | null;
  photoUrl?: string | null;
  /** 0..100 — `Math.round(bookedMinutes / availableMinutes * 100)`. */
  loadPct: number;
  bookedMinutes: number;
  /** 0 when working hours not configured for this day. */
  availableMinutes: number;
}

interface CalendarStaffLoadStripProps {
  rows: StaffLoadRow[];
}

function initials(first: string, last: string | null): string {
  const f = first.trim().charAt(0).toUpperCase();
  const l = (last ?? '').trim().charAt(0).toUpperCase();
  return `${f}${l}` || '·';
}

export function CalendarStaffLoadStrip({ rows }: CalendarStaffLoadStripProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-surface-3 bg-white p-s4 shadow-sm">
        <span className="t-eyebrow text-ink-soft">Staff load · today</span>
        <p className="mt-s2 t-body-sm text-ink-soft">No active staff.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-surface-3 bg-white p-s4 shadow-sm">
      <span className="t-eyebrow text-ink-soft">Staff load · today</span>
      <div className="mt-s3 flex flex-col gap-s3">
        {rows.map((r) => {
          const noShift = r.availableMinutes === 0;
          return (
            <div
              key={r.staffId}
              className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-s2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full bg-accent-pale t-caption font-semibold text-ink',
                )}
              >
                {initials(r.firstName, r.lastName)}
              </span>
              <div className="min-w-0">
                <span className="block truncate t-body-sm font-semibold text-ink">
                  {r.firstName}
                </span>
                <div className="mt-[3px] h-[5px] overflow-hidden rounded-sm bg-surface-2">
                  <div
                    className={cn(
                      'h-full rounded-sm',
                      r.loadPct >= 90
                        ? 'bg-red'
                        : r.loadPct >= 70
                          ? 'bg-amber'
                          : 'bg-accent',
                    )}
                    style={{
                      width: `${Math.min(100, Math.max(0, r.loadPct))}%`,
                    }}
                  />
                </div>
              </div>
              {noShift ? (
                <span className="t-caption text-ink-soft" title="No working hours configured">
                  —
                </span>
              ) : (
                <span className="t-caption font-mono font-semibold text-ink-soft">
                  {r.loadPct}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
