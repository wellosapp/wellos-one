'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';

import { Button, FormField, Input, Select } from '@/components/ui';
import type { MediaAccessClass, MediaOwnerType } from '@/lib/api/media';

import type { MediaDirectory, MediaFiltersState } from './MediaLibrary';

interface MediaFiltersProps {
  filters: MediaFiltersState;
  directory: MediaDirectory;
  buildHref: (overrides: Record<string, string | undefined>) => string;
}

const OWNER_TYPES: MediaOwnerType[] = [
  'tenant',
  'location',
  'service',
  'staff',
  'client',
  'appointment',
  'campaign',
];

const ACCESS_CLASSES: { value: MediaAccessClass; label: string }[] = [
  { value: 'public_booking', label: 'Public booking' },
  { value: 'tenant_staff', label: 'Tenant staff' },
  { value: 'client_owned', label: 'Client owned' },
  { value: 'protected_medspa', label: 'Protected medspa' },
  { value: 'generated', label: 'Generated' },
];

// Filters submit via GET — Server Component re-runs with new searchParams.
// We don't need a client-side reducer because the URL is the source of truth.
export function MediaFilters({
  filters,
  directory,
  buildHref,
}: MediaFiltersProps) {
  const router = useRouter();

  // Owner-ID picker depends on ownerType. We render a Select for the
  // common types (location/service/staff/client) using the directory the
  // server already fetched, falling back to a free-text Input for tenant
  // / appointment / campaign (where the operator usually pastes an ID).
  function ownerIdField() {
    if (!filters.ownerType)
      return (
        <Input
          type="text"
          name="ownerId"
          defaultValue=""
          disabled
          placeholder="Pick an owner type first"
        />
      );

    if (filters.ownerType === 'location') {
      return (
        <Select name="ownerId" defaultValue={filters.ownerId ?? ''}>
          <option value="">All locations</option>
          {directory.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      );
    }
    if (filters.ownerType === 'service') {
      return (
        <Select name="ownerId" defaultValue={filters.ownerId ?? ''}>
          <option value="">All services</option>
          {directory.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      );
    }
    if (filters.ownerType === 'staff') {
      return (
        <Select name="ownerId" defaultValue={filters.ownerId ?? ''}>
          <option value="">All staff</option>
          {directory.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName}
              {s.lastName ? ` ${s.lastName}` : ''}
            </option>
          ))}
        </Select>
      );
    }
    if (filters.ownerType === 'client') {
      return (
        <Select name="ownerId" defaultValue={filters.ownerId ?? ''}>
          <option value="">All clients</option>
          {directory.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName}
              {c.lastName ? ` ${c.lastName}` : ''}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        type="text"
        name="ownerId"
        defaultValue={filters.ownerId ?? ''}
        placeholder={`Paste a ${filters.ownerType} ID`}
      />
    );
  }

  const isFiltered =
    filters.ownerType ||
    filters.ownerId ||
    filters.accessClass ||
    filters.folder ||
    filters.includeArchived;

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-s3 rounded-md border border-surface-3 bg-white p-s4 shadow-sm"
    >
      <FormField label="Owner type" className="min-w-[160px] flex-none">
        <Select name="ownerType" defaultValue={filters.ownerType ?? ''}>
          <option value="">All types</option>
          {OWNER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Owner" className="min-w-[200px] flex-1">
        {ownerIdField()}
      </FormField>

      <FormField label="Access class" className="min-w-[180px] flex-none">
        <Select name="accessClass" defaultValue={filters.accessClass ?? ''}>
          <option value="">All classes</option>
          {ACCESS_CLASSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Folder" className="min-w-[160px] flex-none">
        <Input
          type="text"
          name="folder"
          defaultValue={filters.folder ?? ''}
          placeholder="e.g. gallery"
        />
      </FormField>

      <label className="flex items-center gap-s2 t-body-sm text-ink-soft">
        <input
          type="checkbox"
          name="includeArchived"
          value="true"
          defaultChecked={filters.includeArchived}
          className="h-4 w-4 rounded-sm border-surface-3 accent-accent"
        />
        Include archived
      </label>

      <div className="flex items-center gap-s2">
        <Button type="submit" variant="primary" size="sm">
          Apply
        </Button>
        {isFiltered && (
          <button
            type="button"
            onClick={() =>
              router.push(
                buildHref({
                  ownerType: undefined,
                  ownerId: undefined,
                  accessClass: undefined,
                  folder: undefined,
                  includeArchived: undefined,
                  skip: undefined,
                }) as Route,
              )
            }
            className="t-body-sm text-accent hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
