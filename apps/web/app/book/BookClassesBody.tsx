import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { Badge, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  PublicClassCatalogResponse,
  PublicClassInstanceDto,
} from '@/lib/api/public-booking-server';

import { BookClassModal } from './BookClassModal';
import { ClassInstanceCard } from './ClassInstanceCard';

// Phase 3b — public Classes browse view. Server component. Filters are
// URL-driven so back/forward + share both work without client state.
//
// Renders an embedded chrome (header + main) parallel to BookPageBody's
// chrome. Tabs are passed in as a slot so the parent owns the tab state
// alongside the data fetch.

type Filters = {
  fromDate?: string;
  toDate?: string;
  classId?: string;
  categoryId?: string;
  staffId?: string;
};

type Props = {
  tenantSlug: string;
  tabs: ReactNode;
  catalog: PublicClassCatalogResponse | null;
  catalogError: string | null;
  instances: PublicClassInstanceDto[];
  instancesError: string | null;
  filters: Filters;
  bookInstanceId?: string;
};

function buildBookHref(tenantSlug: string, filters: Filters, instanceId: string): string {
  const params = new URLSearchParams();
  params.set('type', 'classes');
  if (tenantSlug) params.set('tenant', tenantSlug);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.classId) params.set('classId', filters.classId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.staffId) params.set('staffId', filters.staffId);
  params.set('bookInstance', instanceId);
  return `/book?${params.toString()}`;
}

function buildCloseHref(tenantSlug: string, filters: Filters): string {
  const params = new URLSearchParams();
  params.set('type', 'classes');
  if (tenantSlug) params.set('tenant', tenantSlug);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.classId) params.set('classId', filters.classId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.staffId) params.set('staffId', filters.staffId);
  return `/book?${params.toString()}`;
}

// Server-rendered filter row. Native form submission updates the URL,
// which re-fetches via the server component on the next request — no
// client interactivity needed for filters in this iteration.
function FilterRow({
  catalog,
  tenantSlug,
  filters,
}: {
  catalog: PublicClassCatalogResponse;
  tenantSlug: string;
  filters: Filters;
}) {
  // Sort classes for the picker; the catalog is already alpha-sorted on
  // the server but be defensive in case that changes.
  const classOptions = [...catalog.classes].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const categoryOptions = catalog.categories;

  return (
    <form
      method="GET"
      action="/book"
      className="flex flex-col gap-s3 rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm md:flex-row md:items-end md:gap-s4"
    >
      <input type="hidden" name="type" value="classes" />
      {tenantSlug ? (
        <input type="hidden" name="tenant" value={tenantSlug} />
      ) : null}

      <label className="flex min-w-0 flex-1 flex-col gap-s1 t-body-sm text-ink-soft">
        <span className="font-sans">From</span>
        <input
          type="date"
          name="fromDate"
          defaultValue={
            filters.fromDate ? filters.fromDate.slice(0, 10) : undefined
          }
          className={cn(
            'w-full bg-white text-ink font-sans text-[15px]',
            'border-[1.5px] border-surface-3 rounded-md',
            'px-s3 py-[10px]',
            'focus:outline-none focus:border-accent focus:shadow-focus',
          )}
        />
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-s1 t-body-sm text-ink-soft">
        <span className="font-sans">To</span>
        <input
          type="date"
          name="toDate"
          defaultValue={
            filters.toDate ? filters.toDate.slice(0, 10) : undefined
          }
          className={cn(
            'w-full bg-white text-ink font-sans text-[15px]',
            'border-[1.5px] border-surface-3 rounded-md',
            'px-s3 py-[10px]',
            'focus:outline-none focus:border-accent focus:shadow-focus',
          )}
        />
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-s1 t-body-sm text-ink-soft">
        <span className="font-sans">Category</span>
        <Select name="categoryId" defaultValue={filters.categoryId ?? ''}>
          <option value="">All categories</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-s1 t-body-sm text-ink-soft">
        <span className="font-sans">Class</span>
        <Select name="classId" defaultValue={filters.classId ?? ''}>
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex gap-s2 md:pb-[2px]">
        <button
          type="submit"
          className={cn(
            'inline-flex items-center justify-center rounded-md bg-accent px-s5 py-[10px] t-body-md font-medium text-white shadow-sm',
            'transition-[background-color,transform,box-shadow] duration-fast',
            'hover:-translate-y-px hover:bg-accent-mid hover:shadow-md',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          Filter
        </button>
        <Link
          href={
            (`/book?type=classes${tenantSlug ? `&tenant=${tenantSlug}` : ''}`) as Route
          }
          className={cn(
            'inline-flex items-center justify-center rounded-md border border-surface-3 bg-white px-s5 py-[10px] t-body-md font-medium text-ink no-underline shadow-sm',
            'transition-[background-color] duration-fast hover:bg-surface-2',
          )}
        >
          Reset
        </Link>
      </div>
    </form>
  );
}

export function BookClassesBody({
  tenantSlug,
  tabs,
  catalog,
  catalogError,
  instances,
  instancesError,
  filters,
  bookInstanceId,
}: Props) {
  const selectedInstance = bookInstanceId
    ? instances.find((i) => i.id === bookInstanceId) ?? null
    : null;
  const closeHref = buildCloseHref(tenantSlug, filters);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <Link
          href={
            (`/book${tenantSlug ? `?tenant=${tenantSlug}` : ''}`) as Route
          }
          className="t-display-sm font-display font-semibold text-ink no-underline"
        >
          Wellos
        </Link>
        <nav className="hidden items-center gap-s6 md:flex">
          <span className="t-body-md text-ink-soft">Home</span>
          <span className="t-body-md text-ink-soft">My Appointments</span>
          <span className="t-body-md text-ink-soft">Forms</span>
          <span className="t-body-md text-ink-soft">Files</span>
          <span className="t-body-md text-ink-soft">Profile</span>
        </nav>
        <div
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent-pale t-caption font-bold text-accent"
          aria-hidden
        >
          R
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-s6 py-s8 md:px-s8">
        {!tenantSlug ? (
          <div
            className="mb-s6 rounded-2xl border border-amber-200 bg-amber-50 px-s5 py-s4 t-body-md text-ink"
            role="status"
          >
            Add{' '}
            <code className="rounded bg-white px-s2 py-s1 t-caption">
              ?tenant=your-tenant-slug
            </code>{' '}
            to the URL (or set{' '}
            <code className="rounded bg-white px-s2 py-s1 t-caption">
              NEXT_PUBLIC_BOOKING_TENANT_SLUG
            </code>{' '}
            for local demos).
          </div>
        ) : null}

        {catalogError ? (
          <div
            className="mb-s6 rounded-2xl border border-red-200 bg-red-50 px-s5 py-s4 t-body-md text-red-900"
            role="alert"
          >
            {catalogError}
          </div>
        ) : null}

        <section className="mb-s6 grid gap-s5 rounded-3xl border border-surface-3 bg-gradient-to-br from-white to-accent-pale/30 p-s7 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <span className="t-eyebrow text-accent">Client portal</span>
            <h1 className="mt-s2 t-display-xl text-ink">
              Browse upcoming classes.
            </h1>
            <p className="mt-s3 max-w-xl t-body-md text-ink-soft">
              Pick a class that fits your schedule. Reserve your spot in
              seconds — no password required.
            </p>
            <div className="mt-s4 flex flex-wrap gap-s2">
              <Badge tone="neutral">No payment online — pay at class</Badge>
            </div>
          </div>
        </section>

        <div className="mb-s4">{tabs}</div>

        {catalog ? (
          <div className="mb-s6">
            <FilterRow
              catalog={catalog}
              tenantSlug={tenantSlug}
              filters={filters}
            />
          </div>
        ) : null}

        {instancesError ? (
          <div
            className="mb-s6 rounded-2xl border border-red-200 bg-red-50 px-s5 py-s4 t-body-md text-red-900"
            role="alert"
          >
            {instancesError}
          </div>
        ) : null}

        {tenantSlug && catalog && instances.length === 0 && !instancesError ? (
          <div
            className="rounded-2xl border border-surface-3 bg-white px-s5 py-s7 text-center t-body-md text-ink-soft"
            role="status"
          >
            No classes in this window. Try a wider date range or clear the
            filters.
          </div>
        ) : null}

        {instances.length > 0 ? (
          <div className="grid gap-s4 md:grid-cols-2 lg:grid-cols-3">
            {instances.map((instance) => (
              <ClassInstanceCard
                key={instance.id}
                instance={instance}
                bookHref={buildBookHref(tenantSlug, filters, instance.id)}
              />
            ))}
          </div>
        ) : null}
      </main>

      {selectedInstance ? (
        <BookClassModal
          instance={selectedInstance}
          tenantSlug={tenantSlug}
          closeHref={closeHref}
        />
      ) : null}
    </div>
  );
}
