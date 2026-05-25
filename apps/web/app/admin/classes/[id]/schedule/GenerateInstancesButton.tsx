'use client';

import { useState, useTransition } from 'react';

import { Alert, Button } from '@/components/ui';

import { generateInstancesAction } from './_actions';

// "Generate next 12 weeks" affordance. Calls the manual generation endpoint
// (12-week horizon by default — Epic 8's cron will pick the same default).
// Surfaces a short-lived result banner so the operator gets feedback like
// "Added 18 sessions (24 already existed)" without page-level toast infra.
//
// disabled when the rule is paused (no point generating off an inactive
// rule — the API returns skippedReason: 'rule_inactive' anyway, but we
// gate the button to avoid the confusing "nothing happened" feel).

type Props = {
  classId: string;
  ruleId: string;
  disabled?: boolean;
};

type Feedback = {
  tone: 'success' | 'info' | 'error';
  message: string;
};

export function GenerateInstancesButton({
  classId,
  ruleId,
  disabled = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleClick = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await generateInstancesAction(classId, ruleId, 12);
        if (result.skippedReason === 'rule_inactive') {
          setFeedback({
            tone: 'info',
            message: 'Rule is paused — resume it before generating.',
          });
        } else if (result.skippedReason === 'window_empty') {
          setFeedback({
            tone: 'info',
            message: 'No dates fall in the generation window.',
          });
        } else if (result.created === 0 && result.skipped === 0) {
          setFeedback({
            tone: 'info',
            message: 'No new sessions to add — the next 12 weeks have nothing matching this rule.',
          });
        } else if (result.created === 0) {
          setFeedback({
            tone: 'info',
            message: `All ${result.skipped} sessions in the next 12 weeks already exist.`,
          });
        } else {
          setFeedback({
            tone: 'success',
            message: `Added ${result.created} session${result.created === 1 ? '' : 's'}${
              result.skipped > 0
                ? ` (${result.skipped} already existed)`
                : ''
            }.`,
          });
        }
      } catch (err) {
        setFeedback({
          tone: 'error',
          message:
            err instanceof Error ? err.message : 'Generation failed.',
        });
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-s2">
      <Button
        type="button"
        variant="accent"
        size="sm"
        loading={isPending}
        disabled={disabled}
        onClick={handleClick}
      >
        Generate next 12 weeks
      </Button>
      {feedback && (
        <Alert tone={feedback.tone} className="w-full max-w-sm">
          {feedback.message}
        </Alert>
      )}
    </div>
  );
}
