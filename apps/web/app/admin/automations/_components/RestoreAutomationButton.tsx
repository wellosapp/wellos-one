'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { restoreAutomationWorkflowAction } from '../_actions';

export function RestoreAutomationButton({
  workflowId,
}: {
  workflowId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-s2">
      {error ? <span className="t-caption text-red">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await restoreAutomationWorkflowAction(workflowId);
            if (!res.ok) {
              setError(res.error);
            } else {
              router.refresh();
            }
          });
        }}
        className="t-body-sm text-accent no-underline hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
    </div>
  );
}
