'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  createClientNoteAction,
  type NotesActionState,
} from './_actions';

// Minimal note composer per plan §"Out of scope" — only body + pin toggle.
// Full category/priority/visibility selectors are a follow-up.

const INITIAL: NotesActionState = { ok: false };

export function NotesComposer({ clientId }: { clientId: string }) {
  const boundAction = createClientNoteAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL);

  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the composer after a successful submission.
  useEffect(() => {
    if (state.ok) {
      setBody('');
      setPinned(false);
    }
  }, [state]);

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
        'rounded-md border border-line bg-surface-2 p-s3',
      )}
    >
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a note about this client… (visible to staff only)"
        className={cn(
          'block min-h-[60px] w-full resize-y bg-transparent px-s2 py-s2',
          'font-sans t-body-md text-ink placeholder:text-ink-4',
          'outline-none focus:outline-none',
        )}
        disabled={isPending}
        required
      />
      <input type="hidden" name="pinned" value={pinned ? '1' : '0'} />
      <div
        className={cn(
          'mt-s2 flex flex-wrap items-center gap-s3 border-t border-line-soft pt-s3',
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
          <PinIcon className="h-[14px] w-[14px]" />
          {pinned ? 'Will pin' : 'Pin'}
        </button>

        <span className="t-caption text-ink-4">⌘ + Enter to save</span>

        <span className="ml-auto" />

        {state.error && (
          <span className="t-body-sm text-red" role="alert">
            {state.error}
          </span>
        )}

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

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
