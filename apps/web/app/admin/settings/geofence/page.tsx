import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getLocationGeofence } from '@/lib/api/location-geofence';
import { getWhoami } from '@/lib/api/whoami';
import { cn } from '@/lib/cn';

import { GeofenceEditorBody } from './GeofenceEditorBody';
import { deleteGeofenceAction, updateGeofenceAction } from './_actions';

// /admin/settings/geofence — admin editor for per-location geofences (PR 7
// of the Geofence Auto Check-in epic). Server component: fetches the tenant's
// locations + (optionally) the geofence for the currently-selected location
// via the ?location=<id> query string, then hands off to GeofenceEditorBody.
//
// When the tenant has no locations, we render a friendly empty state with a
// link back to Settings — there's no Locations admin yet, so a "create
// location" CTA would just dead-end.

type SearchParams = {
  location?: string;
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-sage">STUDIO LOCATIONS</span>
        <h1 className="t-display-lg">Geofence auto check-in</h1>
      </header>
      <div
        className={cn(
          'flex flex-col items-center gap-s3 rounded-md border-2 border-dashed',
          'border-line-strong bg-surface-2 p-s8 text-center',
        )}
      >
        <p className="t-body-md text-ink">{message}</p>
        <Link
          href={'/admin/settings' as Route}
          className="t-body-sm text-sage-deep underline underline-offset-2"
        >
          Back to Settings
        </Link>
      </div>
    </div>
  );
}

export default async function AdminGeofenceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // Fetch locations via /admin/whoami — there's no standalone listLocations
  // endpoint yet (single source of truth for tenant identity + locations).
  let whoami: Awaited<ReturnType<typeof getWhoami>>;
  try {
    whoami = await getWhoami();
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <div className="flex flex-col gap-s4">
          <h1 className="t-display-lg">Geofence auto check-in</h1>
          <Alert tone="error">
            You do not have admin access to this tenant.
          </Alert>
        </div>
      );
    }
    throw err;
  }

  const { locations } = whoami;

  if (locations.length === 0) {
    return (
      <EmptyState message="No locations yet — add a location before configuring a geofence." />
    );
  }

  const requested = sp.location?.trim() || undefined;
  const selectedLocation = requested
    ? locations.find((l) => l.id === requested)
    : locations[0];

  // ?location=<bad-id> → redirect to the canonical URL (first location).
  if (requested && !selectedLocation) {
    redirect('/admin/settings/geofence' as Route);
  }

  const selected = selectedLocation!;

  let initialGeofence: Awaited<
    ReturnType<typeof getLocationGeofence>
  >['geofence'] = null;
  let loadError: string | null = null;
  try {
    const res = await getLocationGeofence(selected.id);
    initialGeofence = res.geofence;
  } catch (err) {
    if (err instanceof ApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">Geofence auto check-in</h1>
        <Alert tone="error">{loadError}</Alert>
      </div>
    );
  }

  return (
    <GeofenceEditorBody
      locations={locations}
      selectedLocation={selected}
      initialGeofence={initialGeofence}
      updateAction={updateGeofenceAction}
      deleteAction={deleteGeofenceAction}
    />
  );
}
