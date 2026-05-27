'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';

import { Alert, Button, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  IntakeFormDefinitionDto,
  IntakeFormSubmissionDto,
  IntakeFormSubmissionStatus,
} from '@/lib/api/intake-forms';

import { ReviewStatusPill } from '@/app/admin/_components/forms/ReviewStatusPill';

import {
  cancelClientIntakeAction,
  sendClientIntakeAction,
  startClientIntakeDraftAction,
} from './_actions';

const NON_TERMINAL_STATUSES: ReadonlySet<IntakeFormSubmissionStatus> = new Set([
  'draft',
  'assigned',
  'sent',
  'opened',
  'in_progress',
]);

const FRESH_STATUSES: ReadonlySet<IntakeFormSubmissionStatus> = new Set([
  'draft',
  'assigned',
]);

// Two-section panel: Submissions list + Start-a-draft form. Each section is
// a card matching the SectionHeader chrome used elsewhere on the client
// profile (Overview / Visits / Book / Notes / Files).

function relativeOrAbsolute(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ClientIntakePanel({
  clientId,
  publishedForms,
  submissions,
}: {
  clientId: string;
  publishedForms: IntakeFormDefinitionDto[];
  submissions: IntakeFormSubmissionDto[];
}) {
  const [pendingStart, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [defId, setDefId] = useState(publishedForms[0]?.id ?? '');

  return (
    <div className="flex flex-col gap-s6">
      {message && (
        <Alert tone={message.tone}>{message.text}</Alert>
      )}

      <SectionCard
        eyebrow="SUBMISSIONS"
        headline="Drafts and completed intake."
        subtitle="Submitting locks the answers and writes an audit row (IP + user agent)."
      >
        {submissions.length === 0 ? (
          <div
            className={cn(
              'rounded-md border border-line bg-surface-2 p-s8 text-center',
            )}
          >
            <h4 className="font-display text-[20px] text-ink">
              No submissions yet.
            </h4>
            <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
              Start a draft below to record this client&apos;s answers
              against a published intake form.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-s2">
            {submissions.map((s) => (
              <SubmissionRow
                key={s.id}
                clientId={clientId}
                submission={s}
                onMessage={setMessage}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="NEW DRAFT"
        headline="Create an intake draft."
        subtitle={
          <>
            Only <strong className="text-ink-2">published</strong> forms appear
            here. Manage definitions in{' '}
            <Link
              href="/admin/intake-forms"
              className="text-sage-deep underline hover:text-ink"
            >
              Intake forms
            </Link>
            .
          </>
        }
      >
        {publishedForms.length === 0 ? (
          <div
            className={cn(
              'rounded-md border border-line bg-surface-2 p-s8 text-center',
            )}
          >
            <h4 className="font-display text-[20px] text-ink">
              No published forms yet.
            </h4>
            <p className="mx-auto mt-s2 max-w-md t-body-sm text-ink-3">
              Publish a form definition first.{' '}
              <Link
                href="/admin/intake-forms"
                className="text-sage-deep underline hover:text-ink"
              >
                Open Intake forms
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-s4">
            <div className="flex min-w-[260px] flex-col gap-s2">
              <label
                htmlFor="intake-definition"
                className="t-eyebrow tracking-wide text-ink-3"
              >
                PUBLISHED FORM
              </label>
              <Select
                id="intake-definition"
                value={defId}
                onChange={(e) => setDefId(e.target.value)}
              >
                {publishedForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} (v{f.version})
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              className={cn(
                'bg-sage-deep text-ink-inv enabled:hover:bg-ink',
              )}
              loading={pendingStart}
              disabled={!defId || pendingStart}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await startClientIntakeDraftAction(
                    clientId,
                    defId,
                  );
                  if (!r.ok) {
                    setMessage({
                      tone: 'error',
                      text: r.error ?? 'Could not create draft.',
                    });
                  } else {
                    setMessage({
                      tone: 'success',
                      text: 'Draft created.',
                    });
                  }
                });
              }}
            >
              Create draft
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({
  eyebrow,
  headline,
  subtitle,
  children,
}: {
  eyebrow: string;
  headline: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
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
        <div className="t-eyebrow tracking-wide text-sage">{eyebrow}</div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          {headline}
        </h2>
        {subtitle && (
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
            {subtitle}
          </p>
        )}
      </header>
      <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">{children}</div>
    </section>
  );
}

function SubmissionRow({
  clientId,
  submission,
  onMessage,
}: {
  clientId: string;
  submission: IntakeFormSubmissionDto;
  onMessage: (m: { tone: 'success' | 'error'; text: string } | null) => void;
}) {
  const [pendingSend, sendTransition] = useTransition();
  const [pendingCancel, cancelTransition] = useTransition();
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  const href =
    `/admin/clients/${clientId}/intake/${submission.id}` as Route;
  const isFresh = FRESH_STATUSES.has(submission.status);
  const canSend = NON_TERMINAL_STATUSES.has(submission.status);
  const canCancel = NON_TERMINAL_STATUSES.has(submission.status);

  const sendLabel = isFresh ? 'Send' : 'Resend';

  // Compact subtitle: prefer the most recent meaningful lifecycle timestamp,
  // but always show the create date as the rightmost element so the row has
  // an absolute reference. PR 6 audit-write did not include rich metadata
  // for every action; render what's on the submission row.
  const sentishAt = submission.openedAt ?? submission.startedAt ?? null;

  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-s3',
        'rounded-md border border-line bg-surface-2 px-s4 py-s3 shadow-sm',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-s1">
        <div className="flex flex-wrap items-center gap-s2">
          <span className="t-body-md font-medium text-ink">
            {submission.definition.title}
          </span>
          <span className="t-caption text-ink-4">
            v{submission.definition.version}
          </span>
          <StatusBadge status={submission.status} />
          <ReviewStatusPill
            reviewStatus={submission.reviewStatus}
            submissionId={submission.id}
            reviewedByStaffName={null}
            reviewedAt={submission.reviewedAt}
            reviewNotes={submission.reviewNotes}
          />
        </div>
        <div className="flex flex-wrap items-center gap-s3 t-caption uppercase tracking-wide text-ink-4">
          {submission.submittedAt ? (
            <span>Submitted {relativeOrAbsolute(submission.submittedAt)}</span>
          ) : sentishAt ? (
            <span>
              {submission.openedAt ? 'Opened' : 'Started'}{' '}
              {relativeOrAbsolute(sentishAt)}
            </span>
          ) : (
            <span>Created {relativeOrAbsolute(submission.createdAt)}</span>
          )}
          {submission.submittedAt && sentishAt ? (
            <span className="normal-case text-ink-4/80">
              · Opened {relativeOrAbsolute(sentishAt)}
            </span>
          ) : null}
        </div>
        {sentUrl && (
          <span className="t-caption break-all text-ink-3">
            Magic-link URL:{' '}
            <code className="rounded-sm bg-surface px-s1 text-ink-2">
              {sentUrl}
            </code>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-s2">
        {canSend && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pendingSend}
            disabled={pendingSend || pendingCancel}
            onClick={() => {
              onMessage(null);
              setSentUrl(null);
              sendTransition(async () => {
                const r = await sendClientIntakeAction(
                  clientId,
                  submission.id,
                );
                if (!r.ok) {
                  onMessage({ tone: 'error', text: r.error });
                } else {
                  setSentUrl(r.url);
                  const channelLabel =
                    r.channels.length > 0
                      ? `via ${r.channels.join(' + ')}`
                      : `(${r.resolvedChannel})`;
                  onMessage({
                    tone: 'success',
                    text: `${sendLabel === 'Send' ? 'Sent' : 'Resent'} ${channelLabel}.`,
                  });
                }
              });
            }}
          >
            {sendLabel}
          </Button>
        )}
        {canCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pendingCancel}
            disabled={pendingSend || pendingCancel}
            onClick={() => {
              if (!window.confirm('Cancel this intake form?')) return;
              onMessage(null);
              cancelTransition(async () => {
                const r = await cancelClientIntakeAction(
                  clientId,
                  submission.id,
                );
                if (!r.ok) {
                  onMessage({ tone: 'error', text: r.error ?? 'Could not cancel.' });
                } else {
                  onMessage({
                    tone: 'success',
                    text: 'Submission cancelled.',
                  });
                }
              });
            }}
          >
            Cancel
          </Button>
        )}
        <Link
          href={href}
          className={cn(
            'inline-flex items-center justify-center rounded-sm border px-[14px] py-[7px]',
            't-body-sm font-medium font-sans',
            isFresh
              ? 'border-sage-deep bg-sage-deep text-ink-inv hover:bg-ink'
              : 'border-surface-3 bg-surface text-ink hover:border-sage',
          )}
        >
          {isFresh ? 'Fill in' : 'View'}
        </Link>
      </div>
    </li>
  );
}

const STATUS_BADGE_STYLES: Record<
  IntakeFormSubmissionStatus,
  { label: string; classes: string }
> = {
  draft: {
    label: 'Draft',
    classes: 'border-line bg-surface text-ink-3',
  },
  assigned: {
    label: 'Assigned',
    classes: 'border-line bg-surface text-ink-3',
  },
  sent: {
    label: 'Sent',
    classes: 'border-sage-soft bg-sage-tint/50 text-sage-deep',
  },
  opened: {
    label: 'Opened',
    classes: 'border-sage-soft bg-sage-tint/70 text-sage-deep',
  },
  in_progress: {
    label: 'In progress',
    classes: 'border-sage-soft bg-sage-tint/80 text-sage-deep',
  },
  submitted: {
    label: 'Submitted',
    classes: 'border-sage-soft bg-sage-tint text-sage-deep',
  },
  expired: {
    label: 'Expired',
    classes: 'border-amber/30 bg-amber-pale/60 text-amber',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'border-line bg-surface-sunk text-ink-4',
  },
};

function StatusBadge({ status }: { status: IntakeFormSubmissionStatus }) {
  const config = STATUS_BADGE_STYLES[status] ?? STATUS_BADGE_STYLES.draft;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-s2 py-[2px]',
        config.classes,
        't-caption uppercase tracking-wide',
      )}
    >
      {config.label}
    </span>
  );
}
