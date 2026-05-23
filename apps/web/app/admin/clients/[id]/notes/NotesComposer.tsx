'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { PinIcon } from '@/app/admin/_shell/icons';
import { Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  createClientNoteAction,
  type NotesActionState,
} from './_actions';

// Full-card composer. Wires category + priority + title + body + pin
// against the rich notes schema. Visibility and alertTriggers render
// dimmed for now (Coming-soon italic captions) — they round-trip as
// admin-internal defaults until the Notes domain epic.
//
// URL-state aware: the parent page mounts this only when `?compose=1` is
// present, and we navigate to `closeHref` on cancel + after a successful
// submit to collapse the composer.

const INITIAL: NotesActionState = { ok: false };

const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'preference', label: 'Preference' },
  { value: 'formula', label: 'Formula' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'medical', label: 'Medical' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'billing', label: 'Billing' },
  { value: 'internal', label: 'Internal' },
];

export function NotesComposer({
  clientId,
  closeHref,
}: {
  clientId: string;
  closeHref: Route;
}) {
  const router = useRouter();
  const boundAction = createClientNoteAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL);

  const [category, setCategory] = useState<string>('general');
  const [priority, setPriority] = useState<'normal' | 'alert'>('normal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear + navigate to closeHref after a successful submission.
  useEffect(() => {
    if (state.ok) {
      setCategory('general');
      setPriority('normal');
      setTitle('');
      setBody('');
      setPinned(false);
      router.replace(closeHref);
    }
  }, [state, router, closeHref]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn(
        'flex flex-col gap-s4 rounded-md border border-line bg-surface-2 p-s4',
      )}
    >
      <div className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
        <div className="flex flex-col gap-s2">
          <label
            htmlFor="note-category"
            className="t-eyebrow tracking-wide text-ink-3"
          >
            CATEGORY
          </label>
          <Select
            id="note-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isPending}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-s2">
          <span className="t-eyebrow tracking-wide text-ink-3">PRIORITY</span>
          <div className="inline-flex items-center gap-s2">
            <button
              type="button"
              aria-pressed={priority === 'normal'}
              onClick={() => setPriority('normal')}
              className={cn(
                'inline-flex flex-1 items-center justify-center rounded-md border px-s3 py-[10px]',
                't-body-sm transition-colors duration-fast',
                priority === 'normal'
                  ? 'border-sage bg-sage-tint text-sage-deep'
                  : 'border-line bg-surface text-ink-2 hover:bg-sage-tint-2',
              )}
            >
              Normal
            </button>
            <button
              type="button"
              aria-pressed={priority === 'alert'}
              onClick={() => setPriority('alert')}
              className={cn(
                'inline-flex flex-1 items-center justify-center rounded-md border px-s3 py-[10px]',
                't-body-sm transition-colors duration-fast',
                priority === 'alert'
                  ? 'border-red bg-red-pale text-red'
                  : 'border-line bg-surface text-ink-2 hover:bg-sage-tint-2',
              )}
            >
              Alert
            </button>
          </div>
          <input type="hidden" name="priority" value={priority} />
        </div>
      </div>

      <div className="flex flex-col gap-s2">
        <label
          htmlFor="note-title"
          className="t-eyebrow tracking-wide text-ink-3"
        >
          TITLE <span className="text-ink-4 normal-case">(optional)</span>
        </label>
        <Input
          id="note-title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short headline for this note"
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-s2">
        <label
          htmlFor="note-body"
          className="t-eyebrow tracking-wide text-ink-3"
        >
          NOTE
        </label>
        <textarea
          id="note-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a note about this client… (visible to staff only)"
          className={cn(
            'block min-h-[120px] w-full resize-y bg-white text-ink font-sans text-[16px]',
            'border-[1.5px] border-surface-3 rounded-md',
            'px-s4 py-[13px]',
            'placeholder:text-placeholder',
            'focus:outline-none focus:border-accent focus:shadow-focus',
            'transition-[border-color,box-shadow] duration-fast',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          disabled={isPending}
          required
        />
      </div>

      <input type="hidden" name="pinned" value={pinned ? '1' : '0'} />

      <div className="grid grid-cols-1 gap-s4 sm:grid-cols-2">
        <div className="flex flex-col gap-s2">
          <span className="t-eyebrow tracking-wide text-ink-3">
            ALERT TRIGGERS
          </span>
          <div
            className={cn(
              'flex flex-wrap items-center gap-s3 opacity-60',
              'cursor-not-allowed',
            )}
            title="Coming soon — alert triggers wire into the booking modal in the Notes domain epic."
          >
            <label className="inline-flex items-center gap-s2 t-body-sm text-ink-3">
              <input type="checkbox" disabled aria-disabled="true" />
              At booking
            </label>
            <label className="inline-flex items-center gap-s2 t-body-sm text-ink-3">
              <input type="checkbox" disabled aria-disabled="true" />
              At check-in
            </label>
            <label className="inline-flex items-center gap-s2 t-body-sm text-ink-3">
              <input type="checkbox" disabled aria-disabled="true" />
              At checkout
            </label>
          </div>
          <p className="italic t-caption text-ink-4">
            Coming soon — alert triggers wire into the booking modal in the
            Notes domain epic.
          </p>
        </div>

        <div className="flex flex-col gap-s2">
          <label
            htmlFor="note-visibility"
            className="t-eyebrow tracking-wide text-ink-3"
          >
            VISIBILITY
          </label>
          <div
            className="opacity-60"
            title="Coming soon — clinical and provider-only visibility coming next."
          >
            <Select
              id="note-visibility"
              defaultValue="admin_only"
              disabled
              aria-disabled="true"
            >
              <option value="admin_only">Admin-only</option>
            </Select>
          </div>
          <p className="italic t-caption text-ink-4">
            Coming soon — clinical and provider-only visibility coming next.
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-s3 border-t border-line-soft pt-s4',
        )}
      >
        <button
          type="button"
          aria-pressed={pinned}
          onClick={() => setPinned((v) => !v)}
          className={cn(
            'inline-flex items-center gap-s2 rounded-sm border px-s3 py-s1',
            't-body-sm transition-colors duration-fast',
            pinned
              ? 'border-sage bg-sage-tint text-sage-deep'
              : 'border-line bg-surface text-ink-2 hover:bg-sage-tint-2',
          )}
        >
          <PinIcon size={14} />
          {pinned ? 'Will pin' : 'Pin'}
        </button>

        <span className="t-caption text-ink-4">⌘ + Enter to save</span>

        <span className="ml-auto" />

        {state.error && (
          <span className="t-body-sm text-red" role="alert">
            {state.error}
          </span>
        )}

        <Link href={closeHref} className="no-underline">
          <Button variant="ghost" size="md" type="button">
            Cancel
          </Button>
        </Link>

        <Button
          type="submit"
          variant="primary"
          size="md"
          className={cn('bg-sage-deep text-ink-inv enabled:hover:bg-ink')}
          disabled={isPending || body.trim().length === 0}
          loading={isPending}
        >
          Add note
        </Button>
      </div>
    </form>
  );
}
