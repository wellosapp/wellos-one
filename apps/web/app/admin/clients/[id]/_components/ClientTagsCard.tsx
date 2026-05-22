'use client';

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from 'react';

import { PlusIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import { updateClientAction } from '../../_actions';

import { SectionHeader } from './SectionHeader';

// Tags card for the Overview page. Renders current tags as colored pills
// (color comes from the database tag.color hex), with a "+ Add tag"
// dropdown that lists tags NOT already on the client. Selecting one
// optimistically updates the local list and posts the merged tag-ids back
// via the existing updateClientAction.

type TagSummary = {
  id: string;
  name: string;
  color: string | null;
};

// Picks an ink color (#1B231D ≈ var(--ink)) for light tag swatches and
// white for darker ones. Heuristic luminance check — no design token
// because the swatch color is data, not a token.
function readableInk(hex: string | null): string {
  if (!hex) return '#1B231D';
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m || !m[1]) return '#1B231D';
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Rec.709 relative luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#1B231D' : '#FFFFFF';
}

export function ClientTagsCard({
  clientId,
  currentTags,
  allTags,
}: {
  clientId: string;
  currentTags: TagSummary[];
  allTags: TagSummary[];
}) {
  const [tags, setTags] = useState<TagSummary[]>(currentTags);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const available = useMemo(() => {
    const have = new Set(tags.map((t) => t.id));
    return allTags.filter((t) => !have.has(t.id));
  }, [tags, allTags]);

  function addTag(tag: TagSummary) {
    const next = [...tags, tag];
    setTags(next);
    setOpen(false);
    startTransition(() => {
      const fd = new FormData();
      for (const t of next) fd.append('tagIds', t.id);
      // updateClientAction expects (id, prev, formData). We don't read the
      // returned state here — the parent server component re-renders on
      // the next navigation/revalidate which re-seeds props.
      void updateClientAction(clientId, { ok: false }, fd);
    });
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line/70 bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <SectionHeader
          icon={(p) => (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={p.className}
              aria-hidden
            >
              <path d="M3.5 12.5 12 4h7v7l-8.5 8.5a2 2 0 0 1-2.8 0L3.5 15.3a2 2 0 0 1 0-2.8z" />
              <circle cx="15.5" cy="8.5" r="1.25" />
            </svg>
          )}
          eyebrow="TAGS"
          headline="Labels & segments."
          subtitle="Tag this client for filtering, automations, and reporting."
        />
      </header>
      <div className="flex flex-wrap items-center gap-s2 p-s6 lg:p-s8">
        {tags.length === 0 && (
          <p className="t-body-sm italic text-ink-3">
            No tags yet — add one below.
          </p>
        )}
        {tags.map((tag) => {
          const swatch = tag.color ?? '#C7D1C9';
          const style: CSSProperties = {
            backgroundColor: swatch,
            color: readableInk(tag.color),
          };
          return (
            <span
              key={tag.id}
              style={style}
              className={cn(
                'inline-flex items-center gap-s2 rounded-full px-s3 py-[5px]',
                't-body-sm font-medium',
              )}
            >
              {tag.name}
            </span>
          );
        })}

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={available.length === 0 || isPending}
            className={cn(
              'inline-flex items-center gap-s2 rounded-full border border-dashed border-line',
              'px-s3 py-[5px] t-body-sm text-ink-3',
              'hover:border-sage-soft hover:bg-sage-tint-2 hover:text-ink',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors duration-fast',
            )}
            title={
              available.length === 0
                ? 'All tags are applied.'
                : 'Add a tag to this client'
            }
          >
            <PlusIcon size={14} />
            Add tag
          </button>
          {open && available.length > 0 && (
            <div
              role="menu"
              className={cn(
                'absolute left-0 z-10 mt-s2 max-h-64 min-w-[220px] overflow-y-auto',
                'rounded-md border border-line bg-surface shadow-md',
                'p-s2',
              )}
            >
              {available.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitem"
                  onClick={() => addTag(tag)}
                  className={cn(
                    'flex w-full items-center gap-s2 rounded-sm px-s2 py-s2',
                    't-body-sm text-ink hover:bg-sage-tint-2 cursor-pointer',
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-block h-[12px] w-[12px] shrink-0 rounded-sm border border-line"
                    style={{ backgroundColor: tag.color ?? '#C7D1C9' }}
                  />
                  <span className="flex-1 text-left">{tag.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
