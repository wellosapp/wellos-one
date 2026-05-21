'use client';

import { useState, useTransition } from 'react';

import { Alert, Badge, Card } from '@/components/ui';

import { dismissDisputedMatchAction } from './_actions';
import type {
  ClientMatchStrength,
  DisputedMatchRow,
} from './_api';
import { ReassignDialog } from './ReassignDialog';

// Client-side wrapper around the disputed-matches table. The page server-
// component does the fetch and passes pre-serialized rows; this component
// owns row-action affordances (Dismiss confirm + Reassign dialog).

interface DisputedMatchesTableProps {
  rows: DisputedMatchRow[];
}

function strengthTone(s: ClientMatchStrength): 'green' | 'amber' | 'neutral' | 'red' {
  switch (s) {
    case 'strong':
      return 'green';
    case 'weak':
      return 'amber';
    case 'name_only':
      return 'neutral';
    case 'ambiguous':
      return 'red';
  }
}

function strengthLabel(s: ClientMatchStrength): string {
  switch (s) {
    case 'strong':
      return 'Strong';
    case 'weak':
      return 'Weak';
    case 'name_only':
      return 'Name only';
    case 'ambiguous':
      return 'Ambiguous';
  }
}

type Status =
  | { kind: 'disputed' }
  | { kind: 'ambiguous' }
  | { kind: 'reviewed' };

function deriveStatus(row: DisputedMatchRow): Status {
  if (row.clientMatchDisputed) return { kind: 'disputed' };
  if (row.staffReviewedAt !== null) return { kind: 'reviewed' };
  // Falls through when not disputed AND not reviewed — by the API contract
  // the row is only included if matchStrength === 'ambiguous' here.
  return { kind: 'ambiguous' };
}

function statusBadge(status: Status): { tone: 'red' | 'amber' | 'neutral'; label: string } {
  switch (status.kind) {
    case 'disputed':
      return { tone: 'red', label: 'Disputed' };
    case 'ambiguous':
      return { tone: 'amber', label: 'Ambiguous' };
    case 'reviewed':
      return { tone: 'neutral', label: 'Reviewed' };
  }
}

function clientLabel(row: DisputedMatchRow): string {
  const { firstName, lastName } = row.client;
  return lastName ? `${firstName} ${lastName}` : firstName;
}

function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function contactSummary(row: DisputedMatchRow): string {
  const parts: string[] = [];
  if (row.client.email) parts.push(row.client.email);
  if (row.client.phone) parts.push(row.client.phone);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function DisputedMatchesTable({ rows }: DisputedMatchesTableProps) {
  const [reassignFor, setReassignFor] = useState<DisputedMatchRow | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDismiss(row: DisputedMatchRow) {
    if (
      !window.confirm(
        'Mark this match as reviewed without changing the client?',
      )
    ) {
      return;
    }
    setActionError(null);
    setDismissingId(row.appointmentId);
    startTransition(async () => {
      const res = await dismissDisputedMatchAction(row.appointmentId);
      setDismissingId(null);
      if (!res.ok) setActionError(res.error);
    });
  }

  return (
    <>
      {actionError && <Alert tone="error">{actionError}</Alert>}

      <Card padding="sm" className="overflow-hidden p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-surface-3 bg-surface-2 text-left">
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Booked</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Client</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Scheduled</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Match strength</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
              <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = deriveStatus(row);
              const sb = statusBadge(status);
              const isDismissing = dismissingId === row.appointmentId && pending;
              return (
                <tr
                  key={row.appointmentId}
                  className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                >
                  <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                    {relativeTime(row.createdAt)}
                  </td>
                  <td className="px-s4 py-s3 t-body-md">
                    <div className="text-ink">{clientLabel(row)}</div>
                    <div className="t-body-sm text-ink-soft">
                      {contactSummary(row)}
                    </div>
                  </td>
                  <td className="px-s4 py-s3 t-body-sm text-ink">
                    {formatScheduled(row.scheduledStartAt)}
                  </td>
                  <td className="px-s4 py-s3">
                    {row.matchStrength ? (
                      <Badge tone={strengthTone(row.matchStrength)}>
                        {strengthLabel(row.matchStrength)}
                      </Badge>
                    ) : (
                      <span className="t-body-sm text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-s4 py-s3">
                    <Badge tone={sb.tone}>{sb.label}</Badge>
                  </td>
                  <td className="px-s4 py-s3">
                    <div className="flex items-center justify-end gap-s3">
                      <button
                        type="button"
                        className="t-body-sm text-accent underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => setReassignFor(row)}
                        disabled={pending}
                      >
                        Reassign
                      </button>
                      <button
                        type="button"
                        className="t-body-sm text-ink-soft underline-offset-2 hover:underline hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => onDismiss(row)}
                        disabled={pending}
                      >
                        {isDismissing ? 'Dismissing…' : 'Dismiss'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <ReassignDialog
        appointmentId={reassignFor?.appointmentId ?? ''}
        currentClientLabel={reassignFor ? clientLabel(reassignFor) : ''}
        open={reassignFor !== null}
        onClose={() => setReassignFor(null)}
      />
    </>
  );
}
