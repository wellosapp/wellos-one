import {
  fetchPublicBookingCatalog,
  PublicApiError,
  type PublicBookingCatalogResponse,
} from '@/lib/api/public-booking-server';
import { parseDateParam, toDateParam } from '@/lib/calendar';
import { parseViewParam } from '@/lib/calendar-view';

import { BookPageBody } from './BookPageBody';

type SearchParams = {
  date?: string;
  view?: string;
  tenant?: string;
};

export default async function ClientBookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(sp.date);
  const dateParam = toDateParam(date);
  const view = parseViewParam(sp.view);

  const tenantSlug =
    (typeof sp.tenant === 'string' ? sp.tenant.trim() : '') ||
    (process.env.NEXT_PUBLIC_BOOKING_TENANT_SLUG ?? '').trim();

  let initialCatalog: PublicBookingCatalogResponse | null = null;
  let initialCatalogError: string | null = null;

  if (tenantSlug) {
    try {
      initialCatalog = await fetchPublicBookingCatalog(tenantSlug);
    } catch (err) {
      initialCatalogError =
        err instanceof PublicApiError && err.status === 404
          ? 'This booking link is invalid or no longer available.'
          : 'Could not load the booking catalog. Try again shortly.';
    }
  }

  return (
    <BookPageBody
      date={date}
      dateParam={dateParam}
      view={view}
      tenantSlug={tenantSlug}
      initialCatalog={initialCatalog}
      initialCatalogError={initialCatalogError}
    />
  );
}
