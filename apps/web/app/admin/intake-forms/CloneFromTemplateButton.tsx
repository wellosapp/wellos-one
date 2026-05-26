'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  cloneFromTemplateAction,
  listFormTemplatesAction,
} from './actions';
import { normalizeSchema } from './_schema-utils';
import { PreviewModal } from './builder';

// Mirror of FormTemplateDto from lib/api/form-templates. Inlined here so the
// client bundle doesn't pull in lib/api/client.ts (which uses @clerk/nextjs/server
// and breaks on the client side).
type FormTemplateDto = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  formType: string;
  category: string | null;
  schema: unknown;
  iconName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// Filter chips at the top of the modal. 'all' shows everything; the rest match
// IntakeFormDefinition.formType buckets that have at least one seed template
// in the library (see prisma/seeds/form-templates.ts).
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'intake', label: 'Intake' },
  { value: 'waiver', label: 'Waiver' },
  { value: 'consent', label: 'Consent' },
  { value: 'medical_history', label: 'Medical' },
  { value: 'membership_agreement', label: 'Agreement' },
  { value: 'cancellation_ack', label: 'Cancellation' },
  { value: 'fitness_readiness', label: 'Fitness' },
  { value: 'custom', label: 'Custom' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

const FORM_TYPE_LABEL: Record<string, string> = {
  intake: 'Intake',
  waiver: 'Waiver',
  consent: 'Consent',
  medical_history: 'Medical history',
  soap_intake: 'SOAP intake',
  service_specific: 'Service-specific',
  membership_agreement: 'Agreement',
  cancellation_ack: 'Cancellation policy',
  fitness_readiness: 'Fitness readiness',
  custom: 'Custom',
};

export function CloneFromTemplateButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => setOpen(true)}
        className="border border-surface-3"
      >
        Clone from template
      </Button>
      {open ? <PickerModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// ---------- Picker modal ----------

function PickerModal({ onClose }: { onClose: () => void }) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [templates, setTemplates] = useState<FormTemplateDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplateDto | null>(null);

  // Esc-to-close + body-scroll-lock — mirrors PreviewModal pattern.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewTemplate) {
          setPreviewTemplate(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, previewTemplate]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listFormTemplatesAction();
        if (cancelled) return;
        if (res.error) {
          setLoadError(res.error);
          return;
        }
        setTemplates(res.templates);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Could not load templates. Is the API running?',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (filter === 'all') return templates;
    return templates.filter((t) => t.formType === filter);
  }, [templates, filter]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:py-s6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-template-title"
    >
      <button
        type="button"
        aria-label="Close template picker"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-[1024px] flex-col overflow-hidden',
          'bg-surface-1 shadow-lg',
          'sm:rounded-2xl',
          'max-h-full sm:max-h-[92vh]',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s4">
          <div className="flex flex-col gap-s1">
            <h2 id="clone-template-title" className="t-display-md text-ink">
              Choose a template
            </h2>
            <p className="t-body-sm text-ink-soft">
              Each template creates a new draft form you can then edit, rename, and publish.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close template picker"
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

        <div className="flex shrink-0 flex-wrap gap-s2 border-b border-surface-3 bg-white px-s6 py-s3">
          {FILTERS.map((f) => {
            const selected = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-s3 py-[6px] t-body-sm transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  selected
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-ink hover:bg-surface-3',
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2/40 px-s6 py-s5">
          {loadError ? (
            <div className="rounded-xl border border-amber/30 bg-amber-pale/60 px-s4 py-s3 t-body-sm text-amber-950">
              {loadError}
            </div>
          ) : null}

          {!loadError && templates === null ? (
            <p className="t-body-md text-ink-soft">Loading templates…</p>
          ) : null}

          {!loadError && templates !== null && filtered.length === 0 ? (
            <p className="t-body-md text-ink-soft">
              No templates match this filter.
            </p>
          ) : null}

          {!loadError && filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-s4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={() => setPreviewTemplate(t)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {previewTemplate ? (
        <PreviewModal
          open
          onClose={() => setPreviewTemplate(null)}
          schema={normalizeSchema(previewTemplate.schema)}
        />
      ) : null}
    </div>
  );
}

// ---------- Card ----------

function TemplateCard({
  template,
  onPreview,
}: {
  template: FormTemplateDto;
  onPreview: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onUse = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const { definitionId } = await cloneFromTemplateAction(template.id);
        router.push(`/admin/intake-forms/${definitionId}`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not clone template. Try again.',
        );
      }
    });
  }, [router, template.id]);

  const formTypeLabel = FORM_TYPE_LABEL[template.formType] ?? template.formType;

  return (
    <div className="flex flex-col gap-s3 rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
      <div className="flex flex-wrap items-start gap-s2">
        <h3 className="flex-1 font-display t-heading-sm text-ink">{template.title}</h3>
        <Badge tone="accent">{formTypeLabel}</Badge>
      </div>
      {template.category ? (
        <span className="t-caption text-ink-soft">
          {capitalize(template.category)}
        </span>
      ) : null}
      {template.description ? (
        <p className="t-body-sm leading-snug text-ink-soft">{template.description}</p>
      ) : null}
      {error ? (
        <p className="t-caption text-red">{error}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-s2 pt-s2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onPreview}
          className="border border-surface-3"
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={onUse}
          loading={pending}
        >
          Use this template
        </Button>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
