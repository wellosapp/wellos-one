'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { FormField, Select } from '@/components/ui';

import type { WhoamiLocation } from '@/lib/api/whoami';

// Location dropdown for the geofence editor. Updates ?location=<id> on the
// current path so the server component re-runs and loads the chosen
// location's geofence. When only one location exists, renders a read-only
// label instead of a dropdown — selecting between one option is busywork.

type Props = {
  locations: WhoamiLocation[];
  selectedLocationId: string;
};

export function LocationSelector({ locations, selectedLocationId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (locations.length === 1) {
    const only = locations[0]!;
    return (
      <FormField label="Location">
        <div
          className="rounded-md border border-line bg-surface-2 px-s4 py-[13px] t-body-md text-ink"
          aria-readonly="true"
        >
          {only.name}
        </div>
      </FormField>
    );
  }

  return (
    <FormField label="Location" hint="Switch locations to edit a different geofence.">
      <Select
        value={selectedLocationId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => {
            // typedRoutes can't statically verify dynamic query strings —
            // cast through to keep type-safety on the rest of the codebase.
            router.push(`/admin/settings/geofence?location=${id}` as never);
          });
        }}
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
