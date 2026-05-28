import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Route } from 'next';

import { Alert, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getAutomationRunDetail } from '@/lib/api/automation-runs';

import { NodeRunTimeline } from '../_components/NodeRunTimeline';
import { RunStatusBadge } from '../_components/RunStatusBadge';
import { TriggerEventPill } from '../_components/TriggerEventPill';
import { triggerEventLabel } from '../_components/triggerEventLabels';

// /admin/automations/runs/[id] — full-page run detail. Two-column on
// desktop (timeline + context sidebar), single-column on mobile with the
// timeline first.

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 14) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function readString(
  obj: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function readChildObject(
  obj: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!obj) return null;
  const v = obj[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function clientDisplayName(
  client: Record<string, unknown> | null,
): string | null {
  if (!client) return null;
  const first = readString(client, 'firstName');
  const last = readString(client, 'lastName');
  const parts = [first, last].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(' ') : null;
}

export default async function AutomationRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getAutomationRunDetail>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await getAutomationRunDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this run.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  if (errorMessage || !data) {
    return (
      <div className="flex flex-col gap-s5">
        <div>
          <Link
            href={'/admin/automations/runs' as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            ← Back to runs
          </Link>
        </div>
        <Alert tone="error">{errorMessage ?? 'Could not load run.'}</Alert>
      </div>
    );
  }

  // Defensive reads from the opaque contextJson — the engine writes a rich
  // payload (enricher output) but older runs or partial enrichments may
  // omit fields. We treat every property as best-effort.
  const ctx =
    data.contextJson && typeof data.contextJson === 'object'
      ? (data.contextJson as Record<string, unknown>)
      : null;
  const client = readChildObject(ctx, 'client');
  const appointment = readChildObject(ctx, 'appointment');
  const classBooking = readChildObject(ctx, 'classBooking');
  const service = readChildObject(ctx, 'service');
  const provider = readChildObject(ctx, 'provider');
  const submission = readChildObject(ctx, 'submission');

  const clientId = readString(client, 'id');
  const clientName = clientDisplayName(client);
  const appointmentId = readString(appointment, 'id');
  const appointmentStart =
    readString(appointment, 'scheduledStartAt') ?? null;
  const submissionId = readString(submission, 'id');

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href={'/admin/automations/runs' as Route}
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to runs
        </Link>
      </div>

      <header className="flex flex-col gap-s3">
        <div className="flex flex-wrap items-start justify-between gap-s4">
          <div className="flex flex-col gap-s2">
            <span className="t-eyebrow text-accent">Automation run</span>
            <h1 className="font-display t-display-sm text-ink">
              {data.workflowName}
            </h1>
            {data.workflowDescription ? (
              <p className="max-w-2xl t-body-md text-ink-soft">
                {data.workflowDescription}
              </p>
            ) : null}
          </div>
          <RunStatusBadge status={data.status} />
        </div>
        <p className="t-body-sm text-ink-soft">
          Triggered by{' '}
          <span className="text-ink font-medium">
            {triggerEventLabel(data.triggerEvent)}
          </span>{' '}
          <span title={formatDateTime(data.createdAt)}>
            {formatRelative(data.createdAt)}
          </span>
          {data.durationMs !== null ? (
            <>
              {' · '}
              <span>Took {formatDuration(data.durationMs)}</span>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-s6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Node timeline" className="min-w-0">
          <Card
            padding="md"
            className="rounded-2xl border border-surface-3 bg-white shadow-sm"
          >
            <h2 className="font-display t-heading-md text-ink mb-s4">
              Node execution
            </h2>
            <NodeRunTimeline runs={data.nodeRuns} />
          </Card>
        </section>

        <aside className="flex flex-col gap-s4">
          <Card
            padding="md"
            className="rounded-lg border border-surface-3 bg-white shadow-sm"
          >
            <h2 className="font-display t-heading-md text-ink">Trigger</h2>
            <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
              <div className="flex flex-col">
                <dt className="t-caption uppercase tracking-wide text-ink-soft">
                  Event
                </dt>
                <dd>
                  <TriggerEventPill type={data.triggerEvent} />
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="t-caption uppercase tracking-wide text-ink-soft">
                  Created
                </dt>
                <dd className="text-ink" title={formatDateTime(data.createdAt)}>
                  {formatRelative(data.createdAt)}
                </dd>
              </div>
              {data.startedAt ? (
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Started
                  </dt>
                  <dd
                    className="text-ink"
                    title={formatDateTime(data.startedAt)}
                  >
                    {formatRelative(data.startedAt)}
                  </dd>
                </div>
              ) : null}
              {data.completedAt ? (
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Completed
                  </dt>
                  <dd
                    className="text-ink"
                    title={formatDateTime(data.completedAt)}
                  >
                    {formatRelative(data.completedAt)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {client || appointment || classBooking || submission ? (
            <Card
              padding="md"
              className="rounded-lg border border-surface-3 bg-white shadow-sm"
            >
              <h2 className="font-display t-heading-md text-ink">
                Linked records
              </h2>
              <dl className="mt-s3 flex flex-col gap-s3 t-body-sm">
                {clientId ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Client
                    </dt>
                    <dd>
                      <Link
                        href={`/admin/clients/${clientId}` as Route}
                        className="text-accent no-underline hover:underline"
                      >
                        {clientName ?? 'Client'}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {appointmentId ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Appointment
                    </dt>
                    <dd className="text-ink">
                      {readString(service, 'name') ?? 'Appointment'}
                      {appointmentStart ? (
                        <span className="block t-caption text-ink-soft">
                          {formatDateTime(appointmentStart)}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {provider ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Provider
                    </dt>
                    <dd className="text-ink">
                      {[
                        readString(provider, 'firstName'),
                        readString(provider, 'lastName'),
                      ]
                        .filter((p): p is string => !!p)
                        .join(' ') || 'Staff'}
                    </dd>
                  </div>
                ) : null}
                {submissionId ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Form submission
                    </dt>
                    <dd>
                      <Link
                        href={
                          `/admin/forms/review-queue/${submissionId}` as Route
                        }
                        className="text-accent no-underline hover:underline"
                      >
                        View submission
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {classBooking && readString(classBooking, 'id') ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Class booking
                    </dt>
                    <dd className="text-ink">
                      {readString(
                        readChildObject(
                          readChildObject(classBooking, 'classInstance'),
                          'class',
                        ),
                        'name',
                      ) ?? 'Class booking'}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <Card
            padding="md"
            className="rounded-lg border border-surface-3 bg-white shadow-sm"
          >
            <h2 className="font-display t-heading-md text-ink">Workflow</h2>
            <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
              <div className="flex flex-col">
                <dt className="t-caption uppercase tracking-wide text-ink-soft">
                  Name
                </dt>
                {/* PR 6 will turn this into a link to /admin/automations/[id]. */}
                <dd className="text-ink">{data.workflowName}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="t-caption uppercase tracking-wide text-ink-soft">
                  Other runs
                </dt>
                <dd>
                  <Link
                    href={{
                      pathname: '/admin/automations/runs',
                      query: { status: 'all', workflowId: data.workflowId },
                    }}
                    className="text-accent no-underline hover:underline"
                  >
                    See all runs of this workflow →
                  </Link>
                </dd>
              </div>
            </dl>
          </Card>

          {data.status === 'failed' && data.errorMessage ? (
            <Card
              padding="md"
              className="rounded-lg border border-red bg-red-pale shadow-sm"
            >
              <h2 className="font-display t-heading-md text-red">
                Error summary
              </h2>
              <p className="mt-s2 t-body-sm text-red">{data.errorMessage}</p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
