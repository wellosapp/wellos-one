'use client';

import type { DragEvent } from 'react';

import { cn } from '@/lib/cn';

import {
  PALETTE_DRAG_MIME,
  PALETTE_GROUPS,
  type PaletteItem,
} from './paletteCatalog';

// Left-rail palette. PR 7 of the Automation System epic.
//
// Renders the catalog from paletteCatalog.ts as draggable cards grouped by
// category. Drag payload is the item id under a wellos-specific MIME type
// so the canvas's onDrop handler can ignore stray drags from elsewhere.
//
// Disabled items (AI placeholders for now) render greyed out with their
// disabledReason as a small badge — visible but non-draggable.

export function PaletteSidebar() {
  return (
    <aside
      aria-label="Workflow palette"
      className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-surface-3 bg-white"
    >
      <div className="border-b border-surface-3 px-s4 py-s3">
        <h2 className="t-eyebrow text-ink-soft">Palette</h2>
        <p className="mt-s1 t-caption text-ink-soft">
          Drag steps onto the canvas
        </p>
      </div>
      <div className="flex-1">
        {PALETTE_GROUPS.map((group) => (
          <section key={group.label} className="border-b border-surface-3 py-s3">
            <h3 className="px-s4 t-eyebrow text-ink-soft">{group.label}</h3>
            <ul className="mt-s2 flex flex-col gap-s1 px-s2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <PaletteCard item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

function PaletteCard({ item }: { item: PaletteItem }) {
  const Icon = item.icon;
  const disabled = Boolean(item.disabled);

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(PALETTE_DRAG_MIME, item.id);
    // Also set text/plain as a fallback for browsers / drop targets that
    // don't surface custom MIME types — the canvas reads our MIME first.
    e.dataTransfer.setData('text/plain', item.id);
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      aria-disabled={disabled || undefined}
      title={disabled ? `${item.label} — ${item.disabledReason ?? 'Coming soon'}` : item.description}
      className={cn(
        'flex items-start gap-s3 rounded-sm border border-surface-3 bg-white px-s3 py-s2',
        'transition-colors duration-fast',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-grab hover:border-accent hover:bg-surface-1 active:cursor-grabbing',
      )}
    >
      <span className="mt-[2px] shrink-0 text-ink-soft">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-s2">
          <span className="t-body-sm font-medium text-ink">{item.label}</span>
          {disabled && item.disabledReason ? (
            <span className="t-caption text-ink-soft">{item.disabledReason}</span>
          ) : null}
        </div>
        <p className="mt-[2px] t-caption text-ink-soft">{item.description}</p>
      </div>
    </div>
  );
}
