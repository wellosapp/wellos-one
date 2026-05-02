'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { ClientAlertStack } from '@/components/admin/ClientAlertStack';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  ClientStats,
  ClientWithTags,
} from '@/lib/client-shared';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { ClientTimelineResponse } from '@/lib/api/timeline';

import { deleteClientAction } from '../../_actions';

// Overview tab — the entry point for the client profile. Shows quick
// stats, active alerts, recent visits, contact info card, address,
// and the soft-delete danger zone.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Summary card with title, body, and optional CTA at bottom-right.
// Mirrors the "Upcoming appointment / Notes / Files / Intake" row in the
// wireframe — each card is a glance + one action.
function SummaryCard({
  icon,
  title,
  children,
  cta,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  cta?: React.ReactNode;
}) {
  return (
    <Card padding="md" className="border border-surface-3 flex flex-col gap-s3">
      <header className="flex items-center gap-s2">
        <span aria-hidden="true">{icon}</span>
        <span className="t-eyebrow text-ink-soft">{title}</span>
      </header>
      <div className="flex flex-1 flex-col gap-s2">{children}</div>
      {cta && <div className="flex justify-end">{cta}</div>}
    </Card>
  );
}

interface OverviewTabProps {
  client: ClientWithTags;
  stats: ClientStats;
  timeline: ClientTimelineResponse;
  allNotes: ClientNoteSummary[];
  editHref: string;
  // Returns the URL that opens the inline VisitQuickViewDrawer for the
  // given appointmentId (?selected=...). Stays on the profile page.
  hrefForVisit: (appointmentId: string) => string;
}

export function OverviewTab({
  client,
  stats,
  timeline,
  allNotes,
  editHref,
  hrefForVisit,
}: OverviewTabProps) {
  const recentVisits = timeline.visits.slice(0, 4);
  const alerts = allNotes.filter((n) => n.priority === 'alert');
  const upcoming = stats.upcomingAppointment;
  const notesHref = `/admin/clients/${client.id}?tab=notes` as Route;
  const filesHref = `/admin/clients/${client.id}?tab=files` as Route;
  const intakeHref = `/admin/clients/${client.id}?tab=intake` as Route;
  const uploadFileHref =
    `/admin/media?upload=1&ownerType=client&ownerId=${client.id}` as Route;

  return (
    <div className="flex flex-col gap-s6">
      {/* Top row: 4 glance-and-act summary cards */}
      <section className="grid grid-cols-1 gap-s3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon="📅"
          title="Upcoming appointment"
          cta={
            upcoming ? (
              <Link
                href={hrefForVisit(upcoming.appointmentId) as Route}
                className="no-underline"
              >
                <Button variant="ghost" size="sm">
                  View →
                </Button>
              </Link>
            ) : (
              <Link
                href={`/admin/calendar?quickbook=1&clientId=${client.id}` as Route}
                className="no-underline"
              >
                <Button variant="accent" size="sm">
                  Quick Book
                </Button>
              </Link>
            )
          }
        >
          {upcoming ? (
            <div className="flex flex-col gap-s1">
              <span className="t-body-md font-medium text-ink">
                {formatDate(upcoming.scheduledStartAt)} ·{' '}
                {formatTime(upcoming.scheduledStartAt)}
              </span>
              <span className="t-body-sm text-ink-soft">
                {upcoming.serviceName ?? 'Service'} with{' '}
                {upcoming.staffName ?? 'staff'}
              </span>
              <Badge tone={upcoming.state === 'confirmed' ? 'green' : 'accent'}>
                {upcoming.state.replace('_', ' ')}
              </Badge>
            </div>
          ) : (
            <p className="t-body-sm text-ink-soft italic">
              No upcoming appointment.
            </p>
          )}
        </SummaryCard>

        <SummaryCard
          icon="💬"
          title="Notes"
          cta={
            <Link
              href={notesHref}
              className="no-underline"
            >
              <Button variant="ghost" size="sm">
                {stats.totalNotes === 0 ? 'Add note' : 'View all'}
              </Button>
            </Link>
          }
        >
          <div className="flex flex-col gap-s1">
            <span className="t-display-md font-display text-ink">
              {stats.totalNotes}
            </span>
            <span className="t-body-sm text-ink-soft">
              {stats.totalNotes === 0
                ? 'No notes yet'
                : stats.totalAlertNotes > 0
                  ? `${stats.totalAlertNotes} alert${stats.totalAlertNotes === 1 ? '' : 's'}`
                  : 'All clear'}
            </span>
          </div>
        </SummaryCard>

        <SummaryCard
          icon="📎"
          title="Files"
          cta={
            <Link
              href={stats.totalFiles === 0 ? uploadFileHref : filesHref}
              className="no-underline"
            >
              <Button variant="ghost" size="sm">
                {stats.totalFiles === 0 ? 'Upload file' : 'View all'}
              </Button>
            </Link>
          }
        >
          <div className="flex flex-col gap-s1">
            <span className="t-display-md font-display text-ink">
              {stats.totalFiles}
            </span>
            <span className="t-body-sm text-ink-soft">
              {stats.totalFiles === 0 ? 'No files uploaded' : 'across visits + profile'}
            </span>
          </div>
        </SummaryCard>

        <SummaryCard
          icon="📋"
          title="Intake"
          cta={
            <Link href={intakeHref} className="no-underline">
              <Button variant="ghost" size="sm">
                {client.intakeStatus === 'pending'
                  ? 'Send intake'
                  : 'View answers'}
              </Button>
            </Link>
          }
        >
          <div className="flex flex-col gap-s1">
            <span
              className={
                client.intakeStatus === 'completed'
                  ? 't-body-md font-medium text-green'
                  : client.intakeStatus === 'pending'
                    ? 't-body-md font-medium text-amber'
                    : 't-body-md font-medium text-ink'
              }
            >
              {client.intakeStatus === 'completed'
                ? 'Complete'
                : client.intakeStatus === 'pending'
                  ? 'Pending'
                  : client.intakeStatus === 'sent'
                    ? 'Sent'
                    : 'Expired'}
            </span>
            <span className="t-body-sm text-ink-soft">
              {client.intakeStatus === 'completed'
                ? 'All forms submitted'
                : client.intakeStatus === 'pending'
                  ? 'Intake not yet completed'
                  : client.intakeStatus === 'sent'
                    ? 'Awaiting client response'
                    : 'Intake link expired'}
            </span>
          </div>
        </SummaryCard>
      </section>

      {/* Alerts — if any */}
      {alerts.length > 0 && <ClientAlertStack alerts={alerts} />}

      {/* Recent visits — clickable rows that deep-link into the calendar
          drawer for that appointment. Same UX as the wireframe. */}
      <section className="flex flex-col gap-s3">
        <div className="flex items-center justify-between gap-s3">
          <h2 className="t-display-sm text-ink">Recent visits</h2>
          <Link
            href={`/admin/clients/${client.id}?tab=visits` as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            View all visits →
          </Link>
        </div>

        {recentVisits.length === 0 ? (
          <p className="t-body-sm italic text-ink-soft">No visits yet.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-s2">
            {recentVisits.map((v) => {
              const visitHref = hrefForVisit(v.appointment.id) as Route;
              return (
                <li key={v.appointment.id}>
                  <Link
                    href={visitHref}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-s3 rounded-sm border border-surface-3 bg-white p-s3 no-underline',
                      'transition-shadow duration-fast hover:shadow-md',
                    )}
                  >
                    <div className="flex flex-col gap-s1">
                      <div className="flex flex-wrap items-center gap-s2">
                        <span className="t-body-md font-medium text-ink">
                          {v.service.name}
                        </span>
                        <Badge
                          tone={
                            v.appointment.state === 'completed'
                              ? 'green'
                              : v.appointment.state === 'cancelled' ||
                                  v.appointment.state === 'no_show'
                                ? 'red'
                                : 'accent'
                          }
                        >
                          {v.appointment.state.replace('_', ' ')}
                        </Badge>
                      </div>
                      <span className="t-body-sm text-ink-soft">
                        {formatDate(v.appointment.scheduledStartAt)} ·{' '}
                        {formatTime(v.appointment.scheduledStartAt)} · with{' '}
                        {v.staff.firstName}
                        {v.staff.lastName ? ' ' + v.staff.lastName : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-s2">
                      {v.notes.length > 0 && (
                        <Badge tone="neutral">
                          {v.notes.length} note{v.notes.length === 1 ? '' : 's'}
                        </Badge>
                      )}
                      <span aria-hidden="true" className="text-ink-soft">
                        →
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Contact info — read-only display, edit button */}
      <section className="flex flex-col gap-s3">
        <div className="flex items-center justify-between gap-s3">
          <h2 className="t-display-sm text-ink">Contact information</h2>
          <Link href={editHref as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        </div>
        <Card padding="md" className="border border-surface-3">
          <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
            <div>
              <dt className="t-caption text-ink-soft">Email</dt>
              <dd className="t-body-md text-ink break-all">
                {client.email ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Phone</dt>
              <dd className="t-body-md text-ink">{client.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Date of birth</dt>
              <dd className="t-body-md text-ink">
                {client.dateOfBirth
                  ? formatDate(client.dateOfBirth)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Intake status</dt>
              <dd className="t-body-md text-ink">{client.intakeStatus}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="t-caption text-ink-soft">Emergency contact</dt>
              <dd className="t-body-md text-ink">
                {client.emergencyContactName
                  ? `${client.emergencyContactName}${client.emergencyContactPhone ? ' · ' + client.emergencyContactPhone : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {/* Address */}
      <section className="flex flex-col gap-s3">
        <h2 className="t-display-sm text-ink">Address</h2>
        <Card padding="md" className="border border-surface-3">
          <div className="t-body-md text-ink whitespace-pre-line">
            {[
              client.addressLine1,
              client.addressLine2,
              [client.city, client.state, client.postalCode]
                .filter(Boolean)
                .join(', '),
              client.country,
            ]
              .filter(Boolean)
              .join('\n') || '—'}
          </div>
        </Card>
      </section>

      {/* Profile notes */}
      {client.notes && (
        <section className="flex flex-col gap-s3">
          <h2 className="t-display-sm text-ink">Profile notes</h2>
          <Card padding="md" className="border border-surface-3">
            <p className="t-body-md whitespace-pre-wrap text-ink">
              {client.notes}
            </p>
          </Card>
        </section>
      )}

      {/* "Attach files or notes" sticky bottom card — quick access to the
          two most-used compose actions without leaving the Overview. */}
      <section className="rounded-md border border-dashed border-surface-3 bg-surface-2/40 p-s4">
        <div className="flex flex-wrap items-center justify-between gap-s4">
          <div className="flex flex-col gap-s1">
            <h2 className="t-body-md font-medium text-ink flex items-center gap-s2">
              <span aria-hidden="true">📎</span>
              Attach files or notes to this client
            </h2>
            <p className="t-body-sm text-ink-soft">
              Files and notes added here are visible across all appointments
              and staff.
            </p>
          </div>
          <div className="flex items-center gap-s2">
            <Link href={uploadFileHref} className="no-underline">
              <Button variant="ghost" size="md">
                Upload file
              </Button>
            </Link>
            <Link
              href={`/admin/clients/${client.id}?tab=notes` as Route}
              className="no-underline"
            >
              <Button variant="ghost" size="md">
                Add note
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Danger zone — soft-delete */}
      {!client.deletedAt && (
        <section
          className={cn(
            'rounded-md border border-red/20 bg-red-pale/40 p-s4',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete client</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from lists but keeps history. Reversible by an admin via
                DB.
              </p>
            </div>
            <form action={deleteClientAction.bind(null, client.id)}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="text-red hover:bg-red-pale"
              >
                Soft-delete
              </Button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
