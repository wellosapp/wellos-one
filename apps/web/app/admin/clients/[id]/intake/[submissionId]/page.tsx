import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { FormFillPanel } from '@/components/forms/FormFillPanel';
import type { FormFieldConfig, FormFieldType } from '@/components/forms/FormFieldRenderer';
import { ApiError } from '@/lib/api/client';
import { getClientIntakeSubmission } from '@/lib/api/intake-forms';

import {
  normalizeSchema,
  orderedSections,
  fieldsInSection,
  type FieldType as BuilderFieldType,
} from '@/app/admin/intake-forms/_schema-utils';

import {
  submitClientIntakeAction,
  updateClientIntakeAnswersAction,
} from '../_actions';

// Forms PR 2: the builder produces a {sections,fields} shape with new
// field types (short_text, etc). The submission viewer's FormFillPanel
// still speaks the legacy `{ fields: [{ key, type, label, ... }] }` shape
// and the legacy field-type enum. Bridge the two so old + new schemas
// render identically. New types without a legacy renderer (checkbox,
// dropdown, radio, number, phone, email, image_upload, rating, pain_scale)
// fall back to the closest existing legacy widget so a published form is
// never invisible — the richer renderers ship in a follow-up.
const BUILDER_TO_LEGACY_TYPE: Record<BuilderFieldType, FormFieldType> = {
  short_text: 'text',
  long_text: 'long_text',
  date: 'date',
  yes_no: 'yes_no',
  checkbox: 'yes_no',
  multi_select: 'multi_select',
  dropdown: 'multi_select',
  radio: 'multi_select',
  number: 'text',
  phone: 'text',
  email: 'text',
  signature: 'signature',
  file_upload: 'file_upload',
  image_upload: 'file_upload',
  rating: 'text',
  pain_scale: 'text',
};

function schemaToLegacyFields(raw: unknown): { fields: FormFieldConfig[] } {
  const normalized = normalizeSchema(raw);
  const out: FormFieldConfig[] = [];
  // Flatten: top-level fields first (sectionId === null), then each section
  // in order. Inside each section, fields ordered by `order`.
  const topLevel = fieldsInSection(normalized, null);
  for (const f of topLevel) {
    out.push({
      key: f.internalKey,
      type: BUILDER_TO_LEGACY_TYPE[f.type],
      label: f.label,
      required: f.required,
      options: f.options?.map((o) => o.label),
    });
  }
  for (const s of orderedSections(normalized)) {
    for (const f of fieldsInSection(normalized, s.id)) {
      out.push({
        key: f.internalKey,
        type: BUILDER_TO_LEGACY_TYPE[f.type],
        label: f.label,
        required: f.required,
        options: f.options?.map((o) => o.label),
      });
    }
  }
  return { fields: out };
}

export default async function ClientFillIntakePage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id: clientId, submissionId } = await params;

  let submission: Awaited<
    ReturnType<typeof getClientIntakeSubmission>
  >['submission'];
  let definition: Awaited<
    ReturnType<typeof getClientIntakeSubmission>
  >['definition'];
  try {
    const res = await getClientIntakeSubmission(clientId, submissionId);
    submission = res.submission;
    definition = res.definition;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const closeHref = `/admin/clients/${clientId}/intake` as Route;

  async function saveDraft(answers: Record<string, unknown>) {
    'use server';
    return updateClientIntakeAnswersAction(clientId, submissionId, answers);
  }

  async function submit(answers: Record<string, unknown>) {
    'use server';
    return submitClientIntakeAction(clientId, submissionId, answers);
  }

  return (
    <FormFillPanel
      definition={{
        id: definition.id,
        title: definition.title,
        version: definition.version,
        schema: schemaToLegacyFields(definition.schema),
      }}
      initialAnswers={submission.answers}
      // FormFillPanel only distinguishes editable (draft) vs read-only (submitted)
      // for now. Map the widened lifecycle status (PR 6) down to the panel's
      // narrow binary. Terminal `submitted` stays read-only; everything else
      // (draft/assigned/sent/opened/in_progress/expired/cancelled) treats the
      // staff editor as still able to record answers — staff-side fill-in
      // remains the source of truth pre-Submit.
      initialStatus={submission.status === 'submitted' ? 'submitted' : 'draft'}
      saveDraftAction={saveDraft}
      submitAction={submit}
      closeHref={closeHref}
    />
  );
}
