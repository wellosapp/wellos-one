'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Badge, Button, Card } from '@/components/ui';

import {
  regenerateCalendarFeedAction,
  type CalendarFeedActionState,
} from '../_calendar-feed-actions';

function GenerateButton({ hasExisting }: { hasExisting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending
        ? 'Generating…'
        : hasExisting
          ? 'Regenerate subscribe URL'
          : 'Generate subscribe URL'}
    </Button>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in insecure contexts or when the page
      // doesn't have focus — leave the badge silent rather than alerting.
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function CalendarFeedCard({ staffId }: { staffId: string }) {
  const boundAction = regenerateCalendarFeedAction.bind(null, staffId);
  const [state, formAction] = useFormState<CalendarFeedActionState, FormData>(
    boundAction,
    { ok: false },
  );

  return (
    <Card padding="lg">
      <div className="flex flex-col gap-s4">
        <div className="flex flex-col gap-s1">
          <h2 className="t-display-sm">Calendar feed</h2>
          <p className="t-body-sm text-ink-soft">
            One-way subscription URL for Apple Calendar, Outlook, Google Calendar,
            Fantastical, or anything that reads RFC 5545. Appointments appear as
            busy time on this staff member&rsquo;s personal calendar.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-s4">
          <div className="flex flex-wrap items-center gap-s3">
            <GenerateButton hasExisting={Boolean(state.subscribeUrl)} />
            <span className="t-body-sm text-ink-soft">
              Regenerating invalidates any URL already in use.
            </span>
          </div>

          {state.error && <Alert tone="error">{state.error}</Alert>}

          {state.ok && state.subscribeUrl && state.token && (
            <div className="flex flex-col gap-s3">
              <Alert tone="warning" title="Save this now">
                The token is shown once. We store only a hashed copy &mdash; you
                can&rsquo;t recover the URL later, only regenerate a new one.
              </Alert>

              <div className="flex flex-col gap-s2">
                <div className="flex items-center justify-between gap-s2">
                  <span className="t-eyebrow text-accent">Subscribe URL</span>
                  <CopyButton value={state.subscribeUrl} label="Copy URL" />
                </div>
                <pre className="overflow-x-auto rounded-md border border-surface-3 bg-surface-2 px-s3 py-s2 font-mono text-[12px] text-ink">
                  {state.subscribeUrl}
                </pre>
              </div>

              <div className="flex flex-col gap-s2">
                <div className="flex items-center justify-between gap-s2">
                  <span className="t-eyebrow text-accent">Token</span>
                  <CopyButton value={state.token} label="Copy token" />
                </div>
                <pre className="overflow-x-auto rounded-md border border-surface-3 bg-surface-2 px-s3 py-s2 font-mono text-[12px] text-ink">
                  {state.token}
                </pre>
              </div>
            </div>
          )}
        </form>

        <div className="flex flex-col gap-s2 border-t border-surface-3 pt-s4">
          <div className="flex items-center gap-s2">
            <span className="t-eyebrow text-accent">Two-way sync</span>
            <Badge tone="neutral">Coming soon</Badge>
          </div>
          <p className="t-body-sm text-ink-soft">
            Google Calendar and Microsoft Outlook OAuth sync ship in a later
            phase. Until then, the read-only feed above covers every major
            calendar client.
          </p>
          <div className="flex flex-wrap gap-s2">
            <Button type="button" variant="ghost" size="md" disabled>
              Connect Google Calendar
            </Button>
            <Button type="button" variant="ghost" size="md" disabled>
              Connect Outlook
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
