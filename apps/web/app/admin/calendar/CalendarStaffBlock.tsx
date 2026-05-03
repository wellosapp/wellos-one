'use client';

import { blockPosition, formatTimeLocal } from '@/lib/calendar';
import { cn } from '@/lib/cn';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';

interface CalendarStaffBlockProps {
  block: StaffScheduleBlock;
  onDelete?: (blockId: string) => void;
}

export function CalendarStaffBlock({ block, onDelete }: CalendarStaffBlockProps) {
  const { topPx, heightPx } = blockPosition(block.startsAt, block.endsAt);
  if (heightPx <= 0) return null;

  const catLabel = block.category.replace(/_/g, ' ');

  return (
    <div
      className={cn(
        'absolute left-s2 right-s2 z-[3] overflow-hidden rounded-[12px]',
        'border border-dashed border-ink-soft/35 bg-surface-2/90',
        'shadow-sm backdrop-blur-[2px]',
      )}
      style={{ top: topPx, height: heightPx }}
      title={`${block.title} (${formatTimeLocal(block.startsAt)}–${formatTimeLocal(block.endsAt)})`}
    >
      <div className="flex h-full min-h-0 flex-col gap-s1 px-s2 py-s1">
        <div className="flex items-start justify-between gap-s2">
          <span className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
            {catLabel}
          </span>
          {onDelete ? (
            <button
              type="button"
              className="t-caption shrink-0 rounded px-s1 font-medium text-ink-soft underline-offset-2 hover:text-red hover:underline"
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
        <p className="line-clamp-3 t-body-sm font-medium leading-snug text-ink">
          {block.title}
        </p>
        <p className="mt-auto t-caption text-ink-soft">
          {formatTimeLocal(block.startsAt)} – {formatTimeLocal(block.endsAt)}
        </p>
      </div>
    </div>
  );
}
