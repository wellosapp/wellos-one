'use client';

import { formatTimeLocal } from '@/lib/calendar';
import { cn } from '@/lib/cn';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';

interface CalendarStaffBlockProps {
  block: StaffScheduleBlock;
  onDelete?: (blockId: string) => void;
}

// Horizontal block chip. Parent positions absolutely; the chip fills its
// container. Stripes hint "unavailable" without competing with appointment
// chips for attention.
export function CalendarStaffBlock({ block, onDelete }: CalendarStaffBlockProps) {
  const catLabel = block.category.replace(/_/g, ' ');

  return (
    <div
      className={cn(
        'group relative flex h-full w-full flex-col gap-s1 overflow-hidden rounded-md',
        'border border-dashed border-line-strong border-l-[3px] border-l-ink-4',
        'bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_8px,var(--surface)_8px_14px)]',
        'px-s2 py-s2 shadow-sm',
      )}
      title={`${block.title} (${formatTimeLocal(block.startsAt)}–${formatTimeLocal(block.endsAt)})`}
    >
      <div className="flex items-start justify-between gap-s2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {catLabel}
        </span>
        {onDelete ? (
          <button
            type="button"
            className="shrink-0 rounded px-s1 text-[10px] font-medium text-ink-3 underline-offset-2 hover:text-red hover:underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (
                typeof window !== 'undefined' &&
                window.confirm('Remove this blocked time?')
              ) {
                onDelete(block.id);
              }
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="line-clamp-2 t-body-sm font-medium leading-snug text-ink">
        {block.title}
      </p>
      <p className="mt-auto font-mono text-[10px] text-ink-3">
        {formatTimeLocal(block.startsAt)} – {formatTimeLocal(block.endsAt)}
      </p>
    </div>
  );
}
