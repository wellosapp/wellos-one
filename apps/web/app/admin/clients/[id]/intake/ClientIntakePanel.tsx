'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui';
import type {
  IntakeFormDefinitionDto,
  IntakeFormSubmissionDto,
} from '@/lib/api/intake-forms';

import {
  startClientIntakeDraftAction,
  submitClientIntakeAction,
} from './_actions';

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
  const [message, setMessage] = useState<string | null>(null);
  const [defId, setDefId] = useState(publishedForms[0]?.id ?? '');

  return (
    <div className="space-y-s6">
      <Card
        padding="lg"
        className="rounded-2xl border border-surface-3 bg-white shadow-sm"
      >
        <h2 className="font-display t-heading-md text-ink">Submissions</h2>
        <p className="mt-s2 max-w-2xl t-body-md text-ink-soft">
          Drafts and completed intake forms for this client. Submitting locks
          the answers and writes an audit row (IP and user agent).
        </p>

        {message ? (
          <p className="mt-s4 t-body-sm text-ink-soft" role="status">
            {message}
          </p>
        ) : null}

        {submissions.length === 0 ? (
          <p className="mt-s4 t-body-md text-ink-soft">No submissions yet.</p>
        ) : (
          <ul className="mt-s4 divide-y divide-surface-3 border border-surface-3 rounded-lg">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-s3 px-s4 py-s3"
              >
                <div>
                  <p className="t-body-md font-medium text-ink">
                    {s.definition.title}{' '}
                    <span className="t-caption font-normal text-ink-soft">
                      (v{s.definition.version})
                    </span>
                  </p>
                  <p className="t-caption text-ink-soft capitalize">
                    {s.status}
                    {s.submittedAt
                      ? ` · ${new Date(s.submittedAt).toLocaleString()}`
                      : null}
                  </p>
                </div>
                {s.status === 'draft' ? (
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    loading={pendingSubmit}
                    onClick={() => {
                      setMessage(null);
                      submitTransition(async () => {
                        const r = await submitClientIntakeAction(
                          clientId,
                          s.id,
                        );
                        if (!r.ok) setMessage(r.error ?? 'Submit failed.');
                        else setMessage('Submitted.');
                      });
                    }}
                  >
                    Submit as finished
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        padding="lg"
        className="rounded-2xl border border-surface-3 bg-white shadow-sm"
      >
        <h2 className="font-display t-heading-md text-ink">Start a draft</h2>
        <p className="mt-s2 t-body-md text-ink-soft">
          Only <strong className="text-ink">published</strong> forms appear
          here. Manage definitions in{' '}
          <a href="/admin/intake-forms" className="text-accent hover:underline">
            Intake forms
          </a>
          .
        </p>

        {publishedForms.length === 0 ? (
          <p className="mt-s4 t-body-md text-ink-soft">
            No published forms yet. Publish a form first, then return here.
          </p>
        ) : (
          <div className="mt-s4 flex flex-wrap items-end gap-s3">
            <label className="block space-y-s2">
              <span className="t-label text-ink">Published form</span>
              <select
                value={defId}
                onChange={(e) => setDefId(e.target.value)}
                className="min-w-[240px] rounded-lg border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink"
              >
                {publishedForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} (v{f.version})
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="accent"
              loading={pendingStart}
              disabled={!defId}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await startClientIntakeDraftAction(clientId, defId);
                  if (!r.ok) setMessage(r.error ?? 'Could not create draft.');
                  else setMessage('Draft created.');
                });
              }}
            >
              Create draft
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
