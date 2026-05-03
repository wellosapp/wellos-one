'use client';

// useFormState / useFormStatus (react-dom) are the React-18 API; useActionState
// is React 19 only. Next.js 14 ships React 18.
import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui';
import type { IntakeFormDefinitionDto } from '@/lib/api/intake-forms';

import {
  publishIntakeFormDefinitionAction,
  saveIntakeFormDefinitionAction,
  type IntakeFormEditorState,
} from './actions';

const initialSaveState: IntakeFormEditorState = { ok: false };

function SaveDraftButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" loading={pending}>
      Save draft
    </Button>
  );
}

export function IntakeFormEditor({
  definition,
}: {
  definition: IntakeFormDefinitionDto;
}) {
  const [saveState, saveAction] = useFormState<IntakeFormEditorState, FormData>(
    saveIntakeFormDefinitionAction,
    initialSaveState,
  );
  const [pubPending, startPub] = useTransition();
  const [pubMessage, setPubMessage] = useState<string | null>(null);

  const schemaText = JSON.stringify(definition.schema, null, 2);
  const readOnly = definition.status !== 'draft';

  return (
    <div className="space-y-s6">
      <Card
        padding="lg"
        className="rounded-2xl border border-surface-3 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-s4">
          <div>
            <span className="t-eyebrow text-accent">Intake form</span>
            <h1 className="mt-s2 font-display t-display-sm text-ink">
              {definition.title}
            </h1>
            <p className="mt-s2 t-body-sm text-ink-soft">
              Status:{' '}
              <span className="capitalize font-medium text-ink">
                {definition.status}
              </span>
              {' · '}v{definition.version}
              {' · '}group{' '}
              <code className="rounded bg-surface-2 px-s1 font-mono text-[12px]">
                {definition.groupId}
              </code>
            </p>
          </div>
          {!readOnly ? (
            <Button
              type="button"
              variant="primary"
              loading={pubPending}
              onClick={() => {
                setPubMessage(null);
                startPub(async () => {
                  const r = await publishIntakeFormDefinitionAction(
                    definition.id,
                  );
                  if (!r.ok) setPubMessage(r.error ?? 'Publish failed.');
                  else setPubMessage('Published. This version is now live.');
                });
              }}
            >
              Publish
            </Button>
          ) : null}
        </div>

        {pubMessage ? (
          <p
            className={`mt-s4 t-body-sm ${
              pubMessage.includes('failed') || pubMessage.includes('Could not')
                ? 'text-red-700'
                : 'text-ink-soft'
            }`}
            role="status"
          >
            {pubMessage}
          </p>
        ) : null}

        {readOnly ? (
          <p className="mt-s6 rounded-lg bg-surface-2/80 px-s4 py-s3 t-body-sm text-ink-soft">
            Published or archived versions are read-only. Create a new draft
            version from the list (use the same group id when that flow is
            wired), or duplicate in the API.
          </p>
        ) : null}

        <form action={saveAction} className="mt-s6 space-y-s4">
          <input type="hidden" name="id" value={definition.id} />

          <label className="block space-y-s2">
            <span className="t-label text-ink">Title</span>
            <input
              name="title"
              defaultValue={definition.title}
              disabled={readOnly}
              className="w-full max-w-xl rounded-lg border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="block space-y-s2">
            <span className="t-label text-ink">Schema JSON</span>
            <textarea
              name="schemaJson"
              defaultValue={schemaText}
              disabled={readOnly}
              rows={18}
              spellCheck={false}
              className="w-full rounded-lg border border-surface-3 bg-white px-s3 py-s2 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-accent"
            />
          </label>

          {readOnly ? null : (
            <div className="flex flex-wrap items-center gap-s3">
              <SaveDraftButton />
              {saveState.error ? (
                <span className="t-body-sm text-red-700" role="alert">
                  {saveState.error}
                </span>
              ) : saveState.ok ? (
                <span className="t-body-sm text-ink-soft" role="status">
                  Saved.
                </span>
              ) : null}
            </div>
          )}
        </form>
      </Card>

      <p className="t-caption text-ink-soft">
        Field <code className="font-mono text-[12px]">type</code> must be one
        of: text, long_text, date, yes_no, multi_select, signature, file_upload.
        Each field needs <code className="font-mono text-[12px]">key</code> and{' '}
        <code className="font-mono text-[12px]">label</code>.
      </p>
    </div>
  );
}
