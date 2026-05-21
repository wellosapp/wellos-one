import Link from 'next/link';

import { Alert, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';

import { DisputedMatchesTable } from './DisputedMatchesTable';
import {
  listDisputedMatches,
  type ListDisputedMatchesResponse,
} from './_api';

// Admin queue for the "Returning-client recognition" dispute flow
// (docs/04-booking-flow.md §B + "Not You?" escape hatch).
//
// Rows are appointments that are either (a) currently disputed, or (b)
// flagged ambiguous by the matcher. The API drives the "Show resolved"
// filter via includeResolved; pagination is cursor-based.

const PAGE_LIMIT = 25;

type SearchParams = {
  cursor?: string;
  includeResolved?: string;
};

export default async function DisputedMatchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const cursor = sp.cursor?.trim() || undefined;
  const includeResolved =
    sp.includeResolved === 'true' || sp.includeResolved === '1';

  let data: ListDisputedMatchesResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listDisputedMatches({
      cursor,
      limit: PAGE_LIMIT,
      includeResolved,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const rows = data?.rows ?? [];
  const nextCursor = data?.nextCursor ?? null;

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Clients</span>
          <h1 className="t-display-lg">Client matches to review</h1>
          <p className="t-body-sm text-ink-soft">
            Returning-client matches that were disputed by the booker or
            flagged ambiguous by the matcher. Dismiss to keep the existing
            client; reassign to attach the appointment to a different one.
          </p>
        </div>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <label className="flex items-center gap-s2 t-body-sm text-ink-soft">
            <input
              type="checkbox"
              name="includeResolved"
              value="true"
              defaultChecked={includeResolved}
            />
            Show resolved
          </label>
          <Button variant="primary" size="md" type="submit">
            Apply
          </Button>
          {includeResolved && (
            <Link
              href="/admin/disputed-matches"
              className="t-body-sm text-accent no-underline hover:underline"
            >
              Reset
            </Link>
          )}
        </form>
      </Card>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {data && rows.length === 0 && (
        <Card padding="md">
          <p className="t-body-md text-ink">
            No client matches to review.
          </p>
          <p className="t-body-sm text-ink-soft">
            Returning-client matching is working as expected.
          </p>
        </Card>
      )}

      {rows.length > 0 && <DisputedMatchesTable rows={rows} />}

      {nextCursor && (
        <div className="flex items-center gap-s4">
          <Link
            href={{
              pathname: '/admin/disputed-matches',
              query: {
                cursor: nextCursor,
                ...(includeResolved ? { includeResolved: 'true' } : {}),
              },
            }}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
