// Read-only view for an already-submitted form. Reached either by:
//   - A second visit to the same magic link after submitting (re-render
//     with status='submitted' triggers this view from the page.tsx server
//     component).
//   - A future provider-side preview that opens the client surface.
//
// Renders fields with their captured values via the same FormFieldRenderer
// in disabled mode — keeps the visual fidelity of the original fill-out
// without needing a second renderer.

import {
  fieldsInSection,
  normalizeSchema,
  orderedSections,
  type FormBuilderSchema,
  type FormField as FormFieldT,
} from '@/app/admin/intake-forms/_schema-utils';
import { evaluateVisibility } from '@/app/admin/intake-forms/_visibility-utils';
import type { PublicFormData } from '@/lib/api/public-forms';

import { FormFieldRenderer } from './_components/FormFieldRenderer';

interface FormReadOnlyViewProps {
  data: PublicFormData;
}

export function FormReadOnlyView({ data }: FormReadOnlyViewProps) {
  const schema: FormBuilderSchema = normalizeSchema(data.definition.schema);
  const sections = orderedSections(schema);
  const topLevel = fieldsInSection(schema, null);
  const answers = data.submission.answers ?? {};

  const renderField = (field: FormFieldT) => {
    if (!evaluateVisibility(field.visibility, answers, schema.fields)) {
      return null;
    }
    return (
      <FormFieldRenderer
        key={field.id}
        field={field}
        value={answers[field.id]}
        onChange={() => {
          /* read-only */
        }}
        onSignatureChange={() => {
          /* read-only */
        }}
        disabled
        fileUploadEnabled={false}
      />
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-surface-3 bg-white">
        <div className="mx-auto w-full max-w-[720px] px-s5 py-s5 sm:px-s6">
          <span className="t-caption text-ink-soft">{data.tenantName}</span>
          <h1 className="mt-s1 font-display text-[24px] leading-tight text-ink">
            {data.definition.title}
          </h1>
          <span className="mt-s2 inline-flex items-center rounded-sm border border-sage/40 bg-sage-tint px-s2 py-[2px] t-caption uppercase tracking-wide text-sage-deep">
            Submitted
          </span>
          {data.submission.submittedAt ? (
            <p className="mt-s2 t-caption text-ink-soft">
              Received {formatDate(data.submission.submittedAt)}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 px-s5 py-s6 sm:px-s6">
        {topLevel.length > 0 ? (
          <div className="flex flex-col gap-s5">{topLevel.map(renderField)}</div>
        ) : null}

        {sections.map((s) => {
          const fields = fieldsInSection(schema, s.id);
          return (
            <section
              key={s.id}
              className="mt-s6 rounded-2xl border border-surface-3 bg-white px-s5 py-s5 shadow-sm"
            >
              <h2 className="font-display text-[20px] leading-tight text-ink">
                {s.title || 'Untitled section'}
              </h2>
              {s.description ? (
                <p className="mt-s2 t-body-sm text-ink-soft">{s.description}</p>
              ) : null}
              <div className="mt-s4 flex flex-col gap-s5">
                {fields.map(renderField)}
              </div>
            </section>
          );
        })}

        {topLevel.length === 0 && sections.length === 0 ? (
          <p className="rounded-md border border-dashed border-surface-3 bg-surface-2/40 px-s5 py-s5 text-center t-body-md text-ink-soft">
            This form has no fields.
          </p>
        ) : null}
      </main>

      <footer className="border-t border-surface-3 bg-white">
        <div className="mx-auto w-full max-w-[640px] px-s5 py-s4 sm:px-s6">
          <p className="t-caption text-ink-soft">
            Need to update something? Contact {data.tenantName} for a new form link.
          </p>
        </div>
      </footer>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
