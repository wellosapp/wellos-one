'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Route } from 'next';

import { Alert, Button, FormField, Input, Textarea, Select } from '@/components/ui';
import { cn } from '@/lib/cn';

import { createAutomationAction } from '../_actions';
import { TRIGGER_EVENT_GROUPS } from './triggerEventGroups';

// "+ New automation" modal. Opened from the list page header. Submitting
// creates the workflow and routes to the canvas edit page.

export function CreateAutomationModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('');

  // Esc-to-close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Body scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!triggerType) {
      setError('Choose a trigger to start from.');
      return;
    }
    startTransition(async () => {
      const res = await createAutomationAction({
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/automations/${res.workflowId}/edit` as Route);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:py-s6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-automation-title"
    >
      <button
        type="button"
        aria-label="Close new automation dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-[560px] flex-col overflow-hidden',
          'bg-surface-1 shadow-lg',
          'sm:rounded-2xl',
          'max-h-full sm:max-h-[92vh]',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s4">
          <div className="flex flex-col gap-s1">
            <h2 id="create-automation-title" className="t-display-md text-ink">
              New automation
            </h2>
            <p className="t-body-sm text-ink-soft">
              Pick a trigger to start from. You&apos;ll wire up actions on the canvas.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close new automation dialog"
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft',
              'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="flex flex-col gap-s4 px-s6 py-s5">
            {error ? <Alert tone="error">{error}</Alert> : null}

            <FormField label="Name" htmlFor="automation-name">
              <Input
                id="automation-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Welcome new clients"
                required
                autoFocus
              />
            </FormField>

            <FormField
              label="Description (optional)"
              htmlFor="automation-description"
            >
              <Textarea
                id="automation-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </FormField>

            <FormField label="Trigger" htmlFor="automation-trigger">
              <Select
                id="automation-trigger"
                name="triggerType"
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                required
              >
                <option value="">Choose a trigger…</option>
                {TRIGGER_EVENT_GROUPS.map((g) => (
                  <optgroup
                    key={g.label}
                    label={g.comingSoon ? `${g.label} (coming soon)` : g.label}
                  >
                    {g.choices.map((c) => (
                      <option key={c.value} value={c.value} disabled={c.disabled}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FormField>
          </div>

          <footer className="shrink-0 border-t border-surface-3 bg-white px-s6 py-s4">
            <div className="flex items-center justify-end gap-s3">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onClose}
                className="border border-surface-3"
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent" size="md" loading={pending}>
                Create
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
