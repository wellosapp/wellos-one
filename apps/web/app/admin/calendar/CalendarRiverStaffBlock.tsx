'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { formatTimeLocal } from '@/lib/calendar';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';

interface CalendarRiverStaffBlockProps {
  block: StaffScheduleBlock;
  onDelete?: (blockId: string) => void;
}

/**
 * Horizontal schedule-block chip for the river day view. Diagonal-stripe
 * background, dashed border, dashed left rule. Delete-with-confirm preserved
 * from CalendarStaffBlock.tsx (lifted pattern, modal-style instead of inline
 * link so the horizontal layout doesn't get squeezed).
 */
export function CalendarRiverStaffBlock({
  block,
  onDelete,
}: CalendarRiverStaffBlockProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const catLabel = block.category.replace(/_/g, ' ');

  return (
    <>
      <div
        className={cn(
          'flex h-full min-w-0 flex-col justify-center gap-s1 overflow-hidden rounded-md px-s3 py-s2',
          'border border-dashed border-surface-3 border-l-[3px] border-l-ink-soft',
          'shadow-sm',
          // Diagonal-stripe background via inline style — uses CSS vars so
          // tokens still drive the colors.
        )}
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, var(--surface-2) 0 8px, var(--surface-3) 8px 14px)',
        }}
        title={`${block.title} (${formatTimeLocal(block.startsAt)}–${formatTimeLocal(block.endsAt)})`}
      >
        <div className="flex items-start justify-between gap-s2">
          <span className="t-eyebrow text-ink-soft truncate">{catLabel}</span>
          {onDelete ? (
            <button
              type="button"
              className="t-caption shrink-0 rounded px-s1 font-medium text-ink-soft underline-offset-2 hover:text-red hover:underline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="line-clamp-2 t-body-sm font-medium leading-snug text-ink">
          {block.title}
        </p>
        <p className="t-caption font-mono text-ink-soft truncate">
          {formatTimeLocal(block.startsAt)} – {formatTimeLocal(block.endsAt)}
        </p>
      </div>

      {confirmOpen && onDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-s4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rsblock-confirm-title"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-s5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="rsblock-confirm-title"
              className="t-display-sm text-ink"
            >
              Remove this blocked time?
            </h2>
            <p className="mt-s2 t-body-sm text-ink-soft">
              {block.title} · {formatTimeLocal(block.startsAt)}–
              {formatTimeLocal(block.endsAt)}
            </p>
            <div className="mt-s4 flex justify-end gap-s2">
              <button
                type="button"
                className="rounded-sm border border-surface-3 px-s4 py-s2 t-body-sm font-medium text-ink hover:bg-surface-2"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-sm bg-red px-s4 py-s2 t-body-sm font-semibold text-white hover:opacity-90"
                onClick={() => {
                  onDelete(block.id);
                  setConfirmOpen(false);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
