// Forms System PR 10 — client-profile Forms detail page.
//
// Two render paths, picked off `submission.status`:
//   - 'draft'    → keep the legacy editable FormFillPanel (admin filling in
//                  the form on behalf of the client). Rich editing of all
//                  16 types is a future polish PR.
//   - everything else → the rich read-only viewer (PR 10 — uses
//                  FormPreviewRenderer in readOnly mode so every field
//                  type renders properly, not the legacy collapsed
//                  bridge).
//
// In-place rewrite per CLAUDE.md hard rule #15 — the URL stays the same;
// the implementation flips behind it.

import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FormFillPanel } from '@/components/forms/FormFillPanel';
import type { FormFieldConfig, FormFieldType } from '@/components/forms/FormFieldRenderer';
import { Alert, Badge, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getClientIntakeSubmission } from '@/lib/api/intake-forms';
import type { IntakeFormSubmissionStatus } from '@/lib/api/intake-forms';

import { SubmissionContent } from '@/app/admin/_components/forms/SubmissionContent';
import { SubmissionAuditTimeline } from '@/app/admin/_components/forms/SubmissionAuditTimeline';
import { ReviewStatusPill } from '@/app/admin/_components/forms/ReviewStatusPill';
import {
  normalizeSchema,
  orderedSections,
  fieldsInSection,
  type FieldType as BuilderFieldType,
} from '@/app/admin/intake-forms/_schema-utils';

import { loadClientDetail } from '../../_data';
import {
  submitClientIntakeAction,
  updateClientIntakeAnswersAction,
} from '../_actions';

import { PdfDownloadStub } from './PdfDownloadStub';

// ---------- Legacy bridge (only used by the FormFillPanel editable path) ----------
//
// Translates the builder's {sections,fields} shape into the flat legacy
// field list FormFillPanel still speaks. Rich type rendering moved to the
// read viewer in PR 10; FormFillPanel keeps using the bridge until its own
// rebuild ships.
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

// ---------- Display helpers ----------

const STATUS_BADGE_STYLES: Record<
  IntakeFormSubmissionStatus,
  { label: string; tone: 'neutral' | 'accent' | 'red' | 'amber' | 'green' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  assigned: { label: 'Assigned', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'accent' },
  opened: { label: 'Opened', tone: 'accent' },
  in_progress: { label: 'In progress', tone: 'accent' },
  submitted: { label: 'Submitted', tone: 'green' },
  expired: { label: 'Expired', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function clientDisplayName(c: {
  firstName: string;
  lastName: string | null;
}): string {
  const parts = [c.firstName, c.lastName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : 'Client';
}

// ---------- Page ----------

export default async function ClientFillIntakePage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id: clientId, submissionId } = await params;

  let data: Awaited<ReturnType<typeof getClientIntakeSubmission>>;
  try {
    data = await getClientIntakeSubmission(clientId, submissionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const {
    submission,
    definition,
    appointment,
    service,
    reviewedByStaffName,
    fileUploads,
    audits,
  } = data;
  const client = await loadClientDetail(clientId);
  const clientName = clientDisplayName(client);
  const closeHref = `/admin/clients/${clientId}/intake` as Route;

  // ---------- Draft path — keep the legacy editable filler ----------
  // The new rich rendering only ships for read-only views in PR 10. Drafts
  // (which the admin actively types into on behalf of a client) keep the
  // existing widget set until the editable surface gets its own rebuild.
  if (submission.status === 'draft') {
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
        initialStatus="draft"
        saveDraftAction={saveDraft}
        submitAction={submit}
        closeHref={closeHref}
      />
    );
  }

  // ---------- Read view ----------
  const statusBadge =
    STATUS_BADGE_STYLES[submission.status] ?? STATUS_BADGE_STYLES.draft;
  const inProgress = submission.status !== 'submitted';
  const incompleteBanner =
    submission.status === 'cancelled'
      ? 'This submission was cancelled.'
      : submission.status === 'expired'
      ? 'This submission expired before completion.'
      : null;

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s2">
        <div>
          <Link
            href={closeHref}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            ← All forms for {clientName}
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-s4">
          <div className="flex flex-col gap-s2">
            <span className="t-eyebrow text-sage">INTAKE SUBMISSION</span>
            <h1 className="font-display t-display-sm text-ink">
              {definition.title}
            </h1>
            <div className="flex flex-wrap items-center gap-s2">
              <Badge tone="neutral">v{definition.version}</Badge>
              {definition.formType ? (
                <Badge tone="neutral">{definition.formType}</Badge>
              ) : null}
              <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
              <ReviewStatusPill
                reviewStatus={submission.reviewStatus}
                submissionId={submission.id}
                reviewedByStaffName={reviewedByStaffName}
                reviewedAt={submission.reviewedAt}
                reviewNotes={submission.reviewNotes}
              />
            </div>
            <p className="t-caption text-ink-soft">
              {submission.submittedAt ? (
                <>
                  Submitted by{' '}
                  <span className="text-ink">{clientName}</span> on{' '}
                  {formatDateTime(submission.submittedAt)}
                </>
              ) : (
                <>
                  For <span className="text-ink">{clientName}</span> · created{' '}
                  {formatDateTime(submission.createdAt)}
                </>
              )}
            </p>
          </div>
          <PdfDownloadStub
            submissionId={submission.id}
            available={submission.status === 'submitted'}
          />
        </div>
      </header>

      {incompleteBanner ? (
        <Alert tone="warning">{incompleteBanner}</Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-s6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Submission" className="min-w-0 order-2 lg:order-1">
          {inProgress && !incompleteBanner ? (
            <Card
              padding="lg"
              className="rounded-lg border border-surface-3 bg-surface-2/40 shadow-sm"
            >
              <h3 className="t-display-md text-ink">This submission is in progress.</h3>
              <p className="mt-s2 t-body-sm text-ink-soft">
                The client opened the form but has not submitted it yet.
                Answers below reflect what has been typed so far.
              </p>
              <dl className="mt-s4 grid grid-cols-1 gap-s2 t-caption text-ink-soft sm:grid-cols-2">
                <dt>Created</dt>
                <dd>{formatDateTime(submission.createdAt)}</dd>
                {submission.openedAt ? (
                  <>
                    <dt>First opened</dt>
                    <dd>{formatDateTime(submission.openedAt)}</dd>
                  </>
                ) : null}
                {submission.startedAt ? (
                  <>
                    <dt>First typed</dt>
                    <dd>{formatDateTime(submission.startedAt)}</dd>
                  </>
                ) : null}
                {submission.expiresAt ? (
                  <>
                    <dt>Expires</dt>
                    <dd>{formatDateTime(submission.expiresAt)}</dd>
                  </>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <div className={inProgress && !incompleteBanner ? 'mt-s5' : ''}>
            <SubmissionContent
              schema={definition.schema}
              answers={submission.answers}
              signatureData={submission.signatureData}
              submittedAt={submission.submittedAt}
              clientName={clientName}
              fileUploads={fileUploads}
            />
          </div>
        </section>

        <aside className="flex flex-col gap-s4 order-1 lg:order-2">
          <Card
            padding="md"
            className="rounded-lg border border-surface-3 bg-white shadow-sm"
          >
            <h2 className="t-display-md text-ink">Client</h2>
            <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
              <div className="flex flex-col">
                <dt className="t-caption uppercase tracking-wide text-ink-soft">
                  Name
                </dt>
                <dd>
                  <Link
                    href={`/admin/clients/${client.id}` as Route}
                    className="text-accent no-underline hover:underline"
                  >
                    {clientName}
                  </Link>
                </dd>
              </div>
              {client.email ? (
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Email
                  </dt>
                  <dd>
                    <a
                      href={`mailto:${client.email}`}
                      className="text-accent no-underline hover:underline"
                    >
                      {client.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {client.phone ? (
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Phone
                  </dt>
                  <dd>
                    <a
                      href={`tel:${client.phone}`}
                      className="text-accent no-underline hover:underline"
                    >
                      {client.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {appointment && service ? (
            <Card
              padding="md"
              className="rounded-lg border border-surface-3 bg-white shadow-sm"
            >
              <h2 className="t-display-md text-ink">Appointment</h2>
              <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Service
                  </dt>
                  <dd className="text-ink">{service.name}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Scheduled
                  </dt>
                  <dd className="text-ink">
                    {formatDateTime(appointment.scheduledStartAt)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    State
                  </dt>
                  <dd className="text-ink">{appointment.state}</dd>
                </div>
              </dl>
            </Card>
          ) : null}

          <Card
            padding="md"
            className="rounded-lg border border-surface-3 bg-white shadow-sm"
          >
            <h2 className="t-display-md text-ink">Audit trail</h2>
            <div className="mt-s3">
              <SubmissionAuditTimeline audits={audits} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
