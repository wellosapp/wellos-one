import Link from 'next/link';
import type { Route } from 'next';

import { Alert, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listAutomationRuns,
  type AutomationRunStatusFilter,
} from '@/lib/api/automation-runs';

import { RunsTable } from './_components/RunsTable';

// /admin/automations/runs — Automation System PR 5.
//
// Read-only run-history viewer. Default filter = all runs. The status
// filter pills narrow by terminal/in-flight state. Workflow filter is
// exposed via ?workflowId= for deep links from /admin/automations/[id]
// once Phase B PR 6 ships that page.

const PAGE_SIZE = 50;

const STATUS_FILTERS: ReadonlyArray<{
  value: AutomationRunStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function isStatusFilter(v: unknown): v is AutomationRunStatusFilter {
  return (
    v === 'all' ||
    v === 'pending' ||
    v === 'running' ||
    v === 'succeeded' ||
    v === 'failed' ||
    v === 'cancelled'
  );
}

type SearchParams = {
  status?: string;
  workflowId?: string;
  cursor?: string;
};

export default async function AutomationRunsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status: AutomationRunStatusFilter = isStatusFilter(sp.status)
    ? sp.status
    : 'all';
  const workflowId = sp.workflowId?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  let data: Awaited<ReturnType<typeof listAutomationRuns>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listAutomationRuns({
      status,
      workflowId,
      cursor,
      take: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const baseQuery: Record<string, string> = {
    status,
    ...(workflowId ? { workflowId } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-wrap items-start justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Operations</span>
          <h1 className="font-display t-display-sm text-ink">
            Automation runs
          </h1>
          <p className="mt-s1 max-w-2xl t-body-md text-ink-soft">
            Live audit of every workflow execution. Each row is one trigger
            that fired — drill in to see exactly which nodes ran, what they
            received, and what they returned.
          </p>
        </div>
      </header>

      <Card padding="sm" className="flex flex-wrap items-center gap-s3">
        <span className="t-caption uppercase tracking-wide text-ink-soft">
          Filter
        </span>
        {STATUS_FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <Link
              key={f.value}
              href={{
                pathname: '/admin/automations/runs',
                query: {
                  status: f.value,
                  ...(workflowId ? { workflowId } : {}),
                },
              }}
              className={
                active
                  ? 'inline-flex items-center rounded-sm bg-sage-tint px-s3 py-[6px] t-body-sm font-medium text-sage-deep no-underline'
                  : 'inline-flex items-center rounded-sm border border-surface-3 bg-white px-s3 py-[6px] t-body-sm text-ink-soft no-underline transition-colors duration-fast hover:bg-surface-2'
              }
            >
              {f.label}
            </Link>
          );
        })}
        {workflowId ? (
          <Link
            href={{
              pathname: '/admin/automations/runs',
              query: { status },
            }}
            className="ml-auto inline-flex items-center rounded-sm border border-surface-3 bg-white px-s3 py-[6px] t-body-sm text-ink-soft no-underline transition-colors duration-fast hover:bg-surface-2"
          >
            Clear workflow filter
          </Link>
        ) : null}
      </Card>

      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

      {data ? (
        <>
          {data.runs.length === 0 ? (
            <Card
              padding="lg"
              className="rounded-2xl border border-surface-3 bg-white shadow-sm"
            >
              <h2 className="font-display t-heading-md text-ink">
                No runs yet
              </h2>
              <p className="mt-s4 t-body-md text-ink-soft">
                Once a workflow fires, you&apos;ll see it here.
              </p>
            </Card>
          ) : (
            <Card
              padding="sm"
              className="overflow-hidden rounded-2xl border border-surface-3 bg-white p-0 shadow-sm"
            >
              <RunsTable runs={data.runs} />
            </Card>
          )}

          {data.cursor ? (
            <div className="flex items-center gap-s4">
              <Link
                href={{
                  pathname: '/admin/automations/runs',
                  query: { ...baseQuery, cursor: data.cursor },
                }}
                className="t-body-sm text-accent no-underline hover:underline"
              >
                Next page →
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
