'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Button, Card, Textarea } from '@/components/ui';

import {
  cancelSeriesAction,
  type CancelSeriesActionState,
} from '../_actions';

// Two clients on this file:
//
//   1. <CancelSeriesInlineForm> — list-row variant. Uses window.confirm()
//      to keep the table compact; matches the DeleteConfirmButton pattern.
//   2. <CancelSeriesDialog> — detail-page variant. Opens an inline panel with
//      a reason textarea and explicit confirm/cancel buttons.
//
// Both call the same `cancelSeriesAction` server action.

interface CancelSeriesInlineFormProps {
  seriesId: string;
}

export function CancelSeriesInlineForm({
  seriesId,
}: CancelSeriesInlineFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!window.confirm('Cancel this series and its future occurrences?')) {
      return;
    }
    const fd = new FormData();
    startTransition(async () => {
      const initial: CancelSeriesActionState = { ok: false };
      await cancelSeriesAction(seriesId, initial, fd);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <button
        type="submit"
        disabled={pending}
        className="t-body-sm text-red underline-offset-2 hover:underline disabled:opacity-40"
      >
        {pending ? 'Cancelling…' : 'Cancel series'}
      </button>
    </form>
  );
}

interface CancelSeriesDialogProps {
  seriesId: string;
}

export function CancelSeriesDialog({ seriesId }: CancelSeriesDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    const fd = new FormData();
    if (reason.trim().length > 0) fd.set('reason', reason.trim());
    startTransition(async () => {
      const initial: CancelSeriesActionState = { ok: false };
      const result = await cancelSeriesAction(seriesId, initial, fd);
      if (!result.ok && 'error' in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason('');
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="text-red hover:bg-red-pale"
        onClick={() => setOpen(true)}
      >
        Cancel series
      </Button>
    );
  }

  return (
    <Card padding="md" className="border border-red/30 bg-red-pale/30">
      <div className="flex flex-col gap-s3">
        <div>
          <h3 className="t-display-sm text-ink">Cancel this series?</h3>
          <p className="mt-s1 t-body-sm text-ink-soft">
            This cancels the template and every future, non-completed
            occurrence on the calendar. Past visits are unchanged.
          </p>
        </div>
        <label className="flex flex-col gap-s2 t-body-sm text-ink-soft">
          <span className="font-sans">Reason (optional, max 500 chars)</span>
          <Textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="e.g. client moving out of state"
            rows={3}
          />
        </label>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex items-center justify-end gap-s3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setOpen(false);
              setReason('');
              setError(null);
            }}
            disabled={pending}
          >
            Keep series
          </Button>
          <Button
            type="button"
            variant="accent"
            size="md"
            onClick={handleConfirm}
            loading={pending}
            disabled={pending}
            className="bg-red hover:bg-red"
          >
            Cancel series
          </Button>
        </div>
      </div>
    </Card>
  );
}
