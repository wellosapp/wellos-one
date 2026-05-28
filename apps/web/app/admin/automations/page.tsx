import Link from 'next/link';
import type { Route } from 'next';

import { Alert, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listAutomationWorkflows,
  type AutomationWorkflowStatusFilter,
} from '@/lib/api/automation-workflows';

import { AutomationsFilters } from './_components/AutomationsFilters';
import { AutomationsTable } from './_components/AutomationsTable';
import { CreateAutomationButton } from './_components/CreateAutomationButton';

// /admin/automations — Automation System PR 6.
//
// List page. Sibling of /admin/automations/runs (PR 5). Workflow row links
// to /admin/automations/[id]/edit (the canvas page).

const PAGE_SIZE = 50;

function isStatusFilter(v: unknown): v is AutomationWorkflowStatusFilter {
  return (
    v === 'all' ||
    v === 'draft' ||
    v === 'active' ||
    v === 'paused' ||
    v === 'archived' ||
    v === 'error'
  );
}

type SearchParams = {
  status?: string;
  cursor?: string;
};

export default async function AutomationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status: AutomationWorkflowStatusFilter = isStatusFilter(sp.status)
    ? sp.status
    : 'all';
  const cursor = sp.cursor?.trim() || undefined;

  let data: Awaited<ReturnType<typeof listAutomationWorkflows>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listAutomationWorkflows({
      status,
      cursor,
      take: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      errorMessage = 'Could not load automations. Is the API running?';
    }
  }

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-wrap items-start justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Automations</span>
          <h1 className="font-display t-display-sm text-ink">Automations</h1>
          <p className="mt-s1 max-w-2xl t-body-md text-ink-soft">
            Visual workflows that fire on events across the platform.
            Triggered by appointments, forms, clients, files, and more.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-s3">
          <Link
            href={'/admin/automations/runs' as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            View runs →
          </Link>
          <CreateAutomationButton />
        </div>
      </header>

      <AutomationsFilters status={status} />

      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

      {data ? (
        <>
          {data.workflows.length === 0 ? (
            <Card
              padding="lg"
              className="rounded-2xl border border-surface-3 bg-white shadow-sm"
            >
              <h2 className="font-display t-heading-md text-ink">
                No automations yet
              </h2>
              <p className="mt-s4 t-body-md text-ink-soft">
                Create your first workflow. Pick a trigger to start from, then
                wire up actions on the canvas.
              </p>
            </Card>
          ) : (
            <Card
              padding="sm"
              className="overflow-hidden rounded-2xl border border-surface-3 bg-white p-0 shadow-sm"
            >
              <AutomationsTable workflows={data.workflows} />
            </Card>
          )}

          {data.cursor ? (
            <div className="flex items-center gap-s4">
              <Link
                href={
                  {
                    pathname: '/admin/automations',
                    query: { status, cursor: data.cursor },
                  } as unknown as Route
                }
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
