'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { LinkedNotesList } from '@/components/admin/LinkedNotesList';
import { Alert, Badge, Button, Card, Drawer } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ClientTimelineVisit } from '@/lib/api/timeline';

import { transitionAppointmentAction } from '../../calendar/_actions';

// Inline visit drawer for the client profile (E3-S7).
// Click a recent-visit row → this drawer slides in from the right with
// the full visit's data + action buttons. Doctor's-office model: stay
// on the profile, handle everything inline. The full calendar drawer
// (with all 7 tabs + edit affordances) is one click away via "Open in
// calendar" for the rare case where it's needed.

const STATE_TONE: Record<
  string,
  'neutral' | 'accent' | 'amber' | 'green' | 'red'
> = {
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

const NEXT_STATES: Record<string, string[]> = {
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

const ACTION_LABEL: Record<string, string> = {
  scheduled: 'Mark scheduled',
  confirmed: 'Confirm',
  checked_in: 'Check in',
  in_progress: 'Start service',
  completed: 'Complete',
  cancelled: 'Cancel',
  no_show: 'No-show',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface VisitQuickViewDrawerProps {
  clientId: string;
  visit: ClientTimelineVisit;
  onClose: () => void;
}

export function VisitQuickViewDrawer({
  clientId,
  visit,
  onClose,
}: VisitQuickViewDrawerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { appointment, service, staff, notes, bookingAnswers, files } = visit;
  const allowed = NEXT_STATES[appointment.state] ?? [];

  const fullCalendarHref =
    `/admin/calendar?date=${appointment.scheduledStartAt.slice(0, 10)}&selected=${appointment.id}` as Route;
  const addNoteHref =
    `/admin/clients/${clientId}?tab=notes` as Route;

  function fire(to: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await transitionAppointmentAction(
        appointment.id,
        to as Parameters<typeof transitionAppointmentAction>[1],
      );
      if (!result.ok) {
        setError(result.error ?? 'Action failed.');
        return;
      }
      setSuccess(`State updated to ${to.replace('_', ' ')}.`);
      router.refresh();
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Visit quick view"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Visit</span>
          <h2 className="t-display-md text-ink">
            {service.name}
          </h2>
        </div>
      }
      subtitle={
        <span>
          {formatDateTime(appointment.scheduledStartAt)} – {formatTime(appointment.scheduledEndAt)}
        </span>
      }
    >
      <div className="flex flex-col gap-s5 px-s6 py-s5">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        {/* Status + facts */}
        <section className="flex flex-col gap-s3">
          <div className="flex flex-wrap items-center gap-s2">
            <Badge tone={STATE_TONE[appointment.state] ?? 'neutral'}>
              {appointment.state.replace('_', ' ')}
            </Badge>
            {appointment.source && (
              <Badge tone="neutral">via {appointment.source.replace('_', ' ')}</Badge>
            )}
          </div>

          <Card padding="md" className="border border-surface-3">
            <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Service</dt>
                <dd className="t-body-md text-ink">
                  {service.name} · {service.durationMinutes} min
                </dd>
              </div>
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Staff</dt>
                <dd className="t-body-md text-ink">
                  {staff.firstName}
                  {staff.lastName ? ' ' + staff.lastName : ''}
                  {staff.jobTitle && (
                    <span className="t-caption text-ink-soft"> · {staff.jobTitle}</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Starts</dt>
                <dd className="t-body-md text-ink">
                  {formatDateTime(appointment.scheduledStartAt)}
                </dd>
              </div>
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Ends</dt>
                <dd className="t-body-md text-ink">
                  {formatTime(appointment.scheduledEndAt)}
                </dd>
              </div>
            </dl>
          </Card>

          {appointment.notes && (
            <Card padding="md" className="border border-surface-3">
              <div className="flex flex-col gap-s2">
                <span className="t-caption text-ink-soft">Booking notes</span>
                <p className="t-body-md whitespace-pre-wrap text-ink">
                  {appointment.notes}
                </p>
              </div>
            </Card>
          )}
        </section>

        {/* Action row — state transitions inline */}
        {allowed.length > 0 && (
          <section className="flex flex-col gap-s3">
            <h3 className="t-display-sm text-ink">Actions</h3>
            <div className="flex flex-wrap gap-s2">
              {allowed.map((target) => (
                <Button
                  key={target}
                  variant={
                    target === 'cancelled' || target === 'no_show'
                      ? 'ghost'
                      : 'accent'
                  }
                  size="sm"
                  disabled={pending}
                  loading={pending}
                  onClick={() => fire(target)}
                >
                  {ACTION_LABEL[target]}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* Linked notes */}
        <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
          <header className="flex items-center justify-between gap-s3">
            <h3 className="t-display-sm text-ink">
              Notes {notes.length > 0 && <Badge tone="neutral">{notes.length}</Badge>}
            </h3>
            <Link href={addNoteHref} className="no-underline">
              <Button variant="ghost" size="sm">
                + Add note
              </Button>
            </Link>
          </header>
          <LinkedNotesList notes={notes} emptyLabel="No notes for this visit." />
        </section>

        {/* Intake answers */}
        {bookingAnswers.length > 0 && (
          <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
            <h3 className="t-display-sm text-ink">
              Intake answers <Badge tone="neutral">{bookingAnswers.length}</Badge>
            </h3>
            <ul className="flex flex-col gap-s2">
              {bookingAnswers.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-s1 rounded-sm border border-surface-3 bg-white p-s3"
                >
                  <span className="t-caption text-ink-soft">
                    {a.questionLabelSnapshot}
                  </span>
                  <span className="t-body-md text-ink">
                    {typeof a.answerValue === 'string'
                      ? a.answerValue
                      : Array.isArray(a.answerValue)
                        ? a.answerValue.join(', ')
                        : JSON.stringify(a.answerValue)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Files (flat list — full grouping lives on the calendar's Files tab) */}
        {files.length > 0 && (
          <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
            <h3 className="t-display-sm text-ink">
              Files <Badge tone="neutral">{files.length}</Badge>
            </h3>
            <ul className="flex flex-col gap-s2">
              {files.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/admin/media?selected=${f.id}` as Route}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-s2 rounded-sm border border-surface-3 bg-white p-s3 no-underline',
                      'transition-shadow duration-fast hover:shadow-md',
                    )}
                  >
                    <div className="flex flex-col gap-s1 min-w-0">
                      <span
                        className="t-body-sm font-medium text-ink truncate"
                        title={f.fileName}
                      >
                        {f.fileName}
                      </span>
                      <span className="t-caption text-ink-soft">
                        {f.folder} · {formatBytes(f.sizeBytes)}
                      </span>
                    </div>
                    <span aria-hidden="true" className="text-ink-soft">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* SOAP note */}
        {visit.soapNote && (
          <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
            <h3 className="t-display-sm text-ink flex items-center gap-s2">
              SOAP note
              {visit.soapNote.locked && <Badge tone="neutral">Locked</Badge>}
            </h3>
            <Card padding="md" className="border border-surface-3">
              <dl className="flex flex-col gap-s2">
                {visit.soapNote.subjective && (
                  <div>
                    <dt className="t-caption text-ink-soft">Subjective</dt>
                    <dd className="t-body-md whitespace-pre-wrap text-ink">{visit.soapNote.subjective}</dd>
                  </div>
                )}
                {visit.soapNote.objective && (
                  <div>
                    <dt className="t-caption text-ink-soft">Objective</dt>
                    <dd className="t-body-md whitespace-pre-wrap text-ink">{visit.soapNote.objective}</dd>
                  </div>
                )}
                {visit.soapNote.assessment && (
                  <div>
                    <dt className="t-caption text-ink-soft">Assessment</dt>
                    <dd className="t-body-md whitespace-pre-wrap text-ink">{visit.soapNote.assessment}</dd>
                  </div>
                )}
                {visit.soapNote.plan && (
                  <div>
                    <dt className="t-caption text-ink-soft">Plan</dt>
                    <dd className="t-body-md whitespace-pre-wrap text-ink">{visit.soapNote.plan}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </section>
        )}

        {/* Footer escape hatch — full editor in the calendar context */}
        <div className="flex justify-end border-t border-surface-3 pt-s4">
          <Link href={fullCalendarHref} className="no-underline">
            <Button variant="ghost" size="sm">
              Open in calendar →
            </Button>
          </Link>
        </div>
      </div>
    </Drawer>
  );
}
