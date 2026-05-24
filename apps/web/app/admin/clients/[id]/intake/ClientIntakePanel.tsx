'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Alert, Button, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  IntakeFormDefinitionDto,
  IntakeFormSubmissionDto,
} from '@/lib/api/intake-forms';

import {
  startClientIntakeDraftAction,
  submitClientIntakeAction,
} from './_actions';

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
  const [pendingSubmit, submitTransition] = useTransition();
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
              <li
                key={s.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-s3',
                  'rounded-md border border-line bg-surface-2 px-s4 py-s3 shadow-sm',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-s1">
                  <div className="flex flex-wrap items-center gap-s2">
                    <span className="t-body-md font-medium text-ink">
                      {s.definition.title}
                    </span>
                    <span className="t-caption text-ink-4">
                      v{s.definition.version}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  <span className="t-caption uppercase tracking-wide text-ink-4">
                    {s.submittedAt
                      ? `Submitted ${relativeOrAbsolute(s.submittedAt)}`
                      : `Draft created ${relativeOrAbsolute(s.createdAt)}`}
                  </span>
                </div>
                {s.status === 'draft' && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className={cn(
                      'bg-sage-deep text-ink-inv enabled:hover:bg-ink',
                    )}
                    loading={pendingSubmit}
                    disabled={pendingSubmit}
                    onClick={() => {
                      setMessage(null);
                      submitTransition(async () => {
                        const r = await submitClientIntakeAction(
                          clientId,
                          s.id,
                        );
                        if (!r.ok) {
                          setMessage({
                            tone: 'error',
                            text: r.error ?? 'Submit failed.',
                          });
                        } else {
                          setMessage({
                            tone: 'success',
                            text: 'Submission locked.',
                          });
                        }
                      });
                    }}
                  >
                    Submit as finished
                  </Button>
                )}
              </li>
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
