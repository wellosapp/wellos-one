'use client';

import { useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

// Inline cancel affordance — expand to reveal a reason textarea, then submit.
// Bound action receives the optional reason via FormData so we reuse the same
// shape as the server action.

type Props = {
  action: (formData: FormData) => Promise<void>;
  label?: string;
  promptLabel?: string;
};

export function CancelInstanceButton({
  action,
  label = 'Cancel',
  promptLabel = 'Cancel this class instance? Optional reason captured on the audit log.',
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red hover:bg-red-pale"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );
  }

  const handleConfirm = () => {
    const fd = new FormData();
    if (reason.trim().length > 0) fd.set('reason', reason.trim());
    startTransition(async () => {
      await action(fd);
      setOpen(false);
      setReason('');
    });
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-s2 rounded-md border border-red/30 bg-red-pale/40 p-s3',
        'w-full max-w-xs',
      )}
    >
      <p className="t-caption text-ink-soft">{promptLabel}</p>
      <Textarea
        name="reason"
        rows={2}
        maxLength={500}
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-s2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setReason('');
          }}
          disabled={isPending}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="bg-red hover:bg-red"
          onClick={handleConfirm}
          loading={isPending}
        >
          {isPending ? 'Cancelling…' : 'Confirm cancel'}
        </Button>
      </div>
    </div>
  );
}
