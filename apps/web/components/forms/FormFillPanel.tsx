'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { FormFieldRenderer, type FormFieldConfig } from './FormFieldRenderer';

// Orchestrator for filling out a form definition + an answers map. Used by
// both client intake and staff onboarding — the caller supplies server
// actions that hit the right tenant-scoped endpoint.
//
// State model: answers live in local React state. Save Draft persists to the
// server but keeps the page mounted. Submit also persists, then navigates
// back to the list. When `initialStatus === 'submitted'` the panel renders
// read-only (no buttons, all fields disabled).

type ActionResult = { ok: boolean; error?: string };

export type FormFillPanelProps = {
  definition: {
    id: string;
    title: string;
    version: number;
    /** Validated server-side as { fields: FieldConfig[] }. */
    schema: unknown;
  };
  initialAnswers: Record<string, unknown>;
  initialStatus: 'draft' | 'submitted';
  saveDraftAction: (
    answers: Record<string, unknown>,
  ) => Promise<ActionResult>;
  submitAction: (
    answers: Record<string, unknown>,
  ) => Promise<ActionResult>;
  closeHref: Route;
};

function extractFields(schema: unknown): FormFieldConfig[] {
  if (
    schema &&
    typeof schema === 'object' &&
    'fields' in schema &&
    Array.isArray((schema as { fields: unknown }).fields)
  ) {
    return (schema as { fields: FormFieldConfig[] }).fields;
  }
  return [];
}

function isEmpty(value: unknown, type: FormFieldConfig['type']): boolean {
  if (type === 'multi_select') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (type === 'yes_no') {
    // false is a valid answer; only null/undefined count as empty.
    return value !== true && value !== false;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return value === undefined || value === null;
}

export function FormFillPanel({
  definition,
  initialAnswers,
  initialStatus,
  saveDraftAction,
  submitAction,
  closeHref,
}: FormFillPanelProps) {
  const router = useRouter();
  const fields = useMemo(() => extractFields(definition.schema), [definition.schema]);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingDraft, draftTransition] = useTransition();
  const [pendingSubmit, submitTransition] = useTransition();

  const readOnly = initialStatus === 'submitted';

  function setFieldValue(key: string, val: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && isEmpty(answers[field.key], field.type)) {
        next[field.key] = 'Required.';
      }
    }
    return next;
  }

  function onSaveDraft() {
    setMessage(null);
    draftTransition(async () => {
      const r = await saveDraftAction(answers);
      if (!r.ok) {
        setMessage({ tone: 'error', text: r.error ?? 'Could not save draft.' });
      } else {
        setMessage({ tone: 'success', text: 'Draft saved.' });
      }
    });
  }

  function onSubmit() {
    setMessage(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) {
      setMessage({
        tone: 'error',
        text: 'Fix the required fields above before submitting.',
      });
      return;
    }
    submitTransition(async () => {
      const r = await submitAction(answers);
      if (!r.ok) {
        setMessage({ tone: 'error', text: r.error ?? 'Submit failed.' });
        return;
      }
      router.replace(closeHref);
    });
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div className="flex flex-wrap items-center gap-s3">
          <div className="t-eyebrow tracking-wide text-sage">FORM</div>
          <StatusBadge status={initialStatus} />
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          {definition.title}{' '}
          <span className="t-caption text-ink-4">v{definition.version}</span>
        </h2>
        {readOnly && (
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
            This submission has been locked. Answers cannot be edited.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-s5 px-s6 py-s5 lg:px-s8 lg:py-s6">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {fields.length === 0 ? (
          <p className="t-body-md text-ink-3">
            This form has no fields configured.
          </p>
        ) : (
          fields.map((field) => (
            <FormFieldRenderer
              key={field.key}
              field={field}
              value={answers[field.key]}
              onChange={(v) => setFieldValue(field.key, v)}
              disabled={readOnly || pendingSubmit}
              error={errors[field.key]}
            />
          ))
        )}
      </div>

      <footer
        className={cn(
          'flex flex-wrap items-center justify-end gap-s3 border-t border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8',
        )}
      >
        <Link
          href={closeHref}
          className={cn(
            'inline-flex items-center justify-center rounded-md border border-surface-3 bg-surface px-s5 py-[10px]',
            't-body-md font-medium text-ink hover:border-sage',
          )}
        >
          {readOnly ? 'Back' : 'Cancel'}
        </Link>

        {!readOnly && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="md"
              loading={pendingDraft}
              disabled={pendingDraft || pendingSubmit}
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className={cn('bg-sage-deep text-ink-inv enabled:hover:bg-ink')}
              loading={pendingSubmit}
              disabled={pendingDraft || pendingSubmit}
              onClick={onSubmit}
            >
              Submit
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'submitted' }) {
  if (status === 'submitted') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-sm border px-s2 py-[2px]',
          'border-sage-soft bg-sage-tint text-sage-deep',
          't-caption uppercase tracking-wide',
        )}
      >
        Submitted
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-s2 py-[2px]',
        'border-line bg-surface text-ink-3',
        't-caption uppercase tracking-wide',
      )}
    >
      Draft
    </span>
  );
}
