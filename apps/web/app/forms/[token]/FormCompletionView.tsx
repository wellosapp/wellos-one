'use client';

// Interactive public form filler — PR 7 of the Forms System epic.
//
// Receives a PublicFormData payload (already loaded server-side via the
// magic-link token), owns the live answers map + per-page navigation, and
// commits to the API on:
//   - autosave (debounced 1.5s)
//   - Next-page click (also re-validates the current page)
//   - Submit click (full validation)
//
// Multi-section pagination: each section in schema.sections is its own
// page. Top-level fields (sectionId=null) become a synthetic "General" page
// rendered first. When there's only one page, the Next/Back chrome is
// suppressed (single-screen flow).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fieldsInSection,
  normalizeSchema,
  orderedSections,
  type FormBuilderSchema,
  type FormField as FormFieldT,
} from '@/app/admin/intake-forms/_schema-utils';
import { evaluateVisibility } from '@/app/admin/intake-forms/_visibility-utils';
import { ApiError } from '@/lib/api/errors';
import {
  autosavePublicForm,
  submitPublicForm,
  type PublicFormData,
  type SubmitResponse,
} from '@/lib/api/public-forms';
import { cn } from '@/lib/cn';

import { FormConfirmationView } from './FormConfirmationView';
import { AutosaveIndicator, type AutosaveStatus } from './_components/AutosaveIndicator';
import { FormFieldRenderer } from './_components/FormFieldRenderer';
import { FormProgressBar } from './_components/FormProgressBar';
import {
  schemaHasVisibleSignature,
  validateFields,
  type FieldError,
} from './_components/_validation';

interface Page {
  /** null = synthetic General page (top-level fields). Otherwise section id. */
  sectionId: string | null;
  title: string;
  description?: string;
  fields: FormFieldT[];
}

const AUTOSAVE_DEBOUNCE_MS = 1500;

interface Props {
  token: string;
  data: PublicFormData;
}

export function FormCompletionView({ token, data }: Props) {
  const schema = useMemo<FormBuilderSchema>(
    () => normalizeSchema(data.definition.schema),
    [data.definition.schema],
  );

  const pages = useMemo<Page[]>(() => {
    const topLevelFields = fieldsInSection(schema, null);
    const sections = orderedSections(schema);
    const pageList: Page[] = [];
    if (topLevelFields.length > 0 || sections.length === 0) {
      pageList.push({
        sectionId: null,
        title: sections.length === 0 ? data.definition.title : 'General',
        description: sections.length === 0
          ? data.definition.description ?? undefined
          : undefined,
        fields: topLevelFields,
      });
    }
    for (const s of sections) {
      pageList.push({
        sectionId: s.id,
        title: s.title || 'Untitled section',
        description: s.description ?? undefined,
        fields: fieldsInSection(schema, s.id),
      });
    }
    return pageList;
  }, [schema, data.definition.description, data.definition.title]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(
    () => data.submission.answers ?? {},
  );
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SubmitResponse | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedAnswersRef = useRef<string>(JSON.stringify(answers));
  const idempotencyKeyRef = useRef<string>(generateUuid());

  // ---- autosave ----
  const flushAutosave = useCallback(
    async (next: Record<string, unknown>) => {
      const payload = JSON.stringify(next);
      if (payload === lastSavedAnswersRef.current) {
        return;
      }
      setAutosaveStatus('saving');
      try {
        await autosavePublicForm(token, next);
        lastSavedAnswersRef.current = payload;
        setAutosaveStatus('saved');
      } catch (err) {
        // Terminal-state autosave errors imply the link is stale — surface
        // the message but keep the user's typed answers in memory.
        setAutosaveStatus('error');
        if (err instanceof ApiError && err.status === 409) {
          setSubmitError(
            'This form is no longer editable. Refresh to see the current state.',
          );
        }
      }
    },
    [token],
  );

  const scheduleAutosave = useCallback(
    (nextAnswers: Record<string, unknown>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushAutosave(nextAnswers);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushAutosave],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ---- field change ----
  const setFieldValue = useCallback(
    (field: FormFieldT, value: unknown) => {
      setAnswers((prev) => {
        const next = { ...prev, [field.id]: value };
        scheduleAutosave(next);
        return next;
      });
      // Clear the field's error as the user starts editing it.
      setErrors((prev) => {
        if (!prev[field.id]) return prev;
        const next = { ...prev };
        delete next[field.id];
        return next;
      });
    },
    [scheduleAutosave],
  );

  // ---- navigation ----
  const currentPage = pages[pageIndex] ?? pages[0]!;
  const isLastPage = pageIndex === pages.length - 1;
  const isFirstPage = pageIndex === 0;
  const multiPage = pages.length > 1;

  const validatePage = useCallback(
    (page: Page): FieldError[] =>
      validateFields(page.fields, answers, schema.fields),
    [answers, schema.fields],
  );

  const goNext = useCallback(async () => {
    const pageErrors = validatePage(currentPage);
    if (pageErrors.length > 0) {
      const errMap: Record<string, string> = {};
      for (const e of pageErrors) errMap[e.fieldId] = e.message;
      setErrors(errMap);
      // Focus the first errored field — best-effort.
      const first = pageErrors[0]!;
      const el = document.getElementById(`f-${first.fieldId}`);
      el?.focus();
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    // Force-flush autosave on page transition.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await flushAutosave(answers);
    setPageIndex((i) => Math.min(pages.length - 1, i + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [answers, currentPage, flushAutosave, pages.length, validatePage]);

  const goBack = useCallback(() => {
    setPageIndex((i) => Math.max(0, i - 1));
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ---- submit ----
  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    // Validate every visible field across the whole form, not just the
    // current page — a multi-page form might have errors on prior pages
    // (e.g. user navigated back and cleared a field).
    const allErrors = validateFields(
      schema.fields,
      answers,
      schema.fields,
    );
    if (allErrors.length > 0) {
      const errMap: Record<string, string> = {};
      for (const e of allErrors) errMap[e.fieldId] = e.message;
      setErrors(errMap);
      // Jump to the page containing the first error.
      const firstErr = allErrors[0]!;
      const targetField = schema.fields.find((f) => f.id === firstErr.fieldId);
      if (targetField) {
        const idx = pages.findIndex((p) => p.sectionId === targetField.sectionId);
        if (idx >= 0) setPageIndex(idx);
      }
      return;
    }
    if (schemaHasVisibleSignature(schema, answers) && !signatureBase64) {
      setSubmitError('Please sign before submitting.');
      return;
    }

    setSubmitting(true);
    setAutosaveStatus('saving');
    try {
      // Cancel pending autosave — the submit payload is the source of truth.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const result = await submitPublicForm(
        token,
        {
          answers,
          signatureData:
            signatureBase64 ? { imageBase64: signatureBase64 } : null,
        },
        idempotencyKeyRef.current,
      );
      setAutosaveStatus('saved');
      setConfirmation(result);
    } catch (err) {
      setAutosaveStatus('idle');
      if (err instanceof ApiError) {
        if (err.status === 422) {
          const body = err.body as
            | { errors?: FieldError[]; code?: string; message?: string }
            | null;
          if (Array.isArray(body?.errors)) {
            const errMap: Record<string, string> = {};
            for (const e of body!.errors!) errMap[e.fieldId] = e.message;
            setErrors(errMap);
            setSubmitError(body?.message ?? 'Some answers need fixing.');
          } else {
            setSubmitError(body?.message ?? 'Could not submit — check your answers.');
          }
        } else if (err.status === 409 || err.status === 410) {
          const body = err.body as { message?: string } | null;
          setSubmitError(
            body?.message ?? 'This form is no longer accepting submissions.',
          );
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError('Could not submit — check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [answers, pages, schema, signatureBase64, token]);

  if (confirmation) {
    return (
      <FormConfirmationView
        formTitle={confirmation.confirmation.formTitle}
        clientFirstName={confirmation.confirmation.clientFirstName}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-surface-3 bg-white">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-s3 px-s5 py-s4 sm:px-s6">
          <div className="flex items-center justify-between gap-s3">
            <div className="flex flex-col">
              <span className="t-caption text-ink-soft">{data.tenantName}</span>
              <h1 className="font-display text-[22px] leading-tight text-ink">
                {data.definition.title}
              </h1>
            </div>
            {multiPage ? (
              <span className="shrink-0 t-caption text-ink-soft">
                {pageIndex + 1} / {pages.length}
              </span>
            ) : null}
          </div>
          {multiPage ? (
            <FormProgressBar current={pageIndex + 1} total={pages.length} />
          ) : null}
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[640px] px-s5 py-s6 sm:px-s6">
          {data.definition.description && !multiPage ? (
            <p className="mb-s5 t-body-md text-ink-soft">
              {data.definition.description}
            </p>
          ) : null}

          {multiPage ? (
            <div className="mb-s5 flex flex-col gap-s2">
              <h2 className="font-display text-[24px] leading-tight text-ink">
                {currentPage.title}
              </h2>
              {currentPage.description ? (
                <p className="t-body-md text-ink-soft">
                  {currentPage.description}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-s5">
            {currentPage.fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-surface-3 bg-surface-2/40 px-s5 py-s5 text-center t-body-md text-ink-soft">
                This section has no questions.
              </p>
            ) : (
              currentPage.fields.map((field) => {
                if (!evaluateVisibility(field.visibility, answers, schema.fields)) {
                  return null;
                }
                return (
                  <FormFieldRenderer
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    onChange={(v) => setFieldValue(field, v)}
                    onSignatureChange={setSignatureBase64}
                    initialSignatureBase64={null}
                    error={errors[field.id] ?? null}
                    disabled={submitting}
                    fileUploadEnabled={false}
                  />
                );
              })
            )}
          </div>

          {submitError ? (
            <div
              role="alert"
              className="mt-s5 rounded-md border border-red/40 bg-red-pale/60 px-s4 py-s3 t-body-sm text-red"
            >
              {submitError}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-surface-3 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-s3 px-s5 py-s4 sm:px-s6">
          <div className="flex items-center justify-between gap-s3">
            <AutosaveIndicator status={autosaveStatus} />
            <div className="flex items-center gap-s2">
              {multiPage && !isFirstPage ? (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={submitting}
                  className={cn(
                    'rounded-md border border-surface-3 bg-white px-s4 py-[12px] t-body-md text-ink',
                    'transition-colors duration-fast hover:border-ink-soft',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                    submitting && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Back
                </button>
              ) : null}
              {multiPage && !isLastPage ? (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  disabled={submitting}
                  className={cn(
                    'rounded-md bg-sage-deep px-s5 py-[12px] t-body-md font-medium text-white',
                    'transition-colors duration-fast hover:bg-ink',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                    submitting && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  className={cn(
                    'rounded-md bg-sage-deep px-s6 py-[12px] t-body-md font-medium text-white',
                    'transition-colors duration-fast hover:bg-ink',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                    submitting && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// crypto.randomUUID() is fine in modern browsers + Next 14 client builds.
// Fall back to a base-36 random string if it's missing (older mobile Safari).
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
