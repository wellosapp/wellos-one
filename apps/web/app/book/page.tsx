import {
  fetchPublicBookingCatalog,
  fetchPublicClassCatalog,
  fetchPublicClassInstances,
  PublicApiError,
  type PublicBookingCatalogResponse,
  type PublicClassCatalogResponse,
  type PublicClassInstanceDto,
} from '@/lib/api/public-booking-server';
import { parseDateParam, toDateParam } from '@/lib/calendar';
import { parseViewParam } from '@/lib/calendar-view';

import { BookClassesBody } from './BookClassesBody';
import { BookPageBody } from './BookPageBody';
import { BookPageTabs } from './BookPageTabs';

type SearchParams = {
  date?: string;
  view?: string;
  tenant?: string;
  type?: string;
  // Classes filter state (Phase 3b)
  fromDate?: string;
  toDate?: string;
  classId?: string;
  categoryId?: string;
  staffId?: string;
  bookInstance?: string;
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

  // Phase 3b — top-level surface picker. Default `services` keeps the
  // existing /book URL bookmark-stable.
  const activeType: 'services' | 'classes' =
    sp.type === 'classes' ? 'classes' : 'services';

  let servicesCatalog: PublicBookingCatalogResponse | null = null;
  let servicesCatalogError: string | null = null;
  let classesCatalog: PublicClassCatalogResponse | null = null;
  let classesCatalogError: string | null = null;
  let classInstances: PublicClassInstanceDto[] = [];
  let classInstancesError: string | null = null;

  if (tenantSlug) {
    // Only fetch what the active tab needs — the inactive catalog is one
    // round-trip away when the user clicks the tab. Keeps initial paint
    // proportional to the requested surface.
    if (activeType === 'services') {
      try {
        servicesCatalog = await fetchPublicBookingCatalog(tenantSlug);
      } catch (err) {
        servicesCatalogError =
          err instanceof PublicApiError && err.status === 404
            ? 'This booking link is invalid or no longer available.'
            : 'Could not load the booking catalog. Try again shortly.';
      }
    } else {
      try {
        classesCatalog = await fetchPublicClassCatalog(tenantSlug);
      } catch (err) {
        classesCatalogError =
          err instanceof PublicApiError && err.status === 404
            ? 'This booking link is invalid or no longer available.'
            : 'Could not load the classes catalog. Try again shortly.';
      }
      if (classesCatalog) {
        try {
          const res = await fetchPublicClassInstances({
            tenantSlug,
            fromDate: sp.fromDate,
            toDate: sp.toDate,
            classId: sp.classId,
            categoryId: sp.categoryId,
            staffId: sp.staffId,
          });
          classInstances = res.instances;
        } catch (err) {
          classInstancesError =
            err instanceof PublicApiError
              ? 'Could not load upcoming classes. Try again shortly.'
              : 'Could not load upcoming classes. Try again shortly.';
        }
      }
    }
  }

  if (activeType === 'classes') {
    return (
      <BookClassesBody
        tenantSlug={tenantSlug}
        tabs={<BookPageTabs activeType="classes" tenantSlug={tenantSlug} />}
        catalog={classesCatalog}
        catalogError={classesCatalogError}
        instances={classInstances}
        instancesError={classInstancesError}
        filters={{
          fromDate: sp.fromDate,
          toDate: sp.toDate,
          classId: sp.classId,
          categoryId: sp.categoryId,
          staffId: sp.staffId,
        }}
        bookInstanceId={
          typeof sp.bookInstance === 'string' ? sp.bookInstance : undefined
        }
      />
    );
  }

  return (
    <BookPageBody
      date={date}
      dateParam={dateParam}
      view={view}
      tenantSlug={tenantSlug}
      initialCatalog={servicesCatalog}
      initialCatalogError={servicesCatalogError}
    />
  );
}
