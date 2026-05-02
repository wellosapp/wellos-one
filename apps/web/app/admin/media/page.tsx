import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listClients } from '@/lib/api/clients';
import {
  getMediaAsset,
  listMediaAssets,
  type MediaAccessClass,
  type MediaOwnerType,
} from '@/lib/api/media';
import { listServices } from '@/lib/api/services';
import { listStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';

import { MediaLibrary } from './MediaLibrary';

// /admin/media — tenant-wide Media Manager (E3-S5).
// Server-rendered list of MediaAssets with URL-driven filters
// (?ownerType=, ?ownerId=, ?accessClass=, ?folder=, ?includeArchived=,
// ?skip=). When ?selected= is set, drilldown data for the detail drawer
// is fetched server-side too. When ?upload=1 is set, the upload panel
// opens with the directory data pre-loaded for owner pickers.
//
// Per docs/04-booking UI UX Update/wellos_booking_r2_uiux_package
// /wellos_calendar_booking_r2_uiux_buildout.md Step 6 + components L957–971.

const VALID_OWNER_TYPES: MediaOwnerType[] = [
  'tenant',
  'location',
  'service',
  'staff',
  'client',
  'appointment',
  'campaign',
];

const VALID_ACCESS_CLASSES: MediaAccessClass[] = [
  'public_booking',
  'tenant_staff',
  'client_owned',
  'protected_medspa',
  'generated',
];

const PAGE_SIZE = 60;

type SearchParams = {
  ownerType?: string;
  ownerId?: string;
  accessClass?: string;
  folder?: string;
  includeArchived?: string;
  skip?: string;
  selected?: string;
  upload?: string;
};

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const ownerType =
    sp.ownerType && (VALID_OWNER_TYPES as string[]).includes(sp.ownerType)
      ? (sp.ownerType as MediaOwnerType)
      : undefined;
  const accessClass =
    sp.accessClass &&
    (VALID_ACCESS_CLASSES as string[]).includes(sp.accessClass)
      ? (sp.accessClass as MediaAccessClass)
      : undefined;
  const folder = sp.folder?.trim() || undefined;
  const ownerId = sp.ownerId?.trim() || undefined;
  const includeArchived =
    sp.includeArchived === 'true' || sp.includeArchived === '1';
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);
  const uploadOpen = sp.upload === '1';

  let directoryError: string | null = null;
  let listing: Awaited<ReturnType<typeof listMediaAssets>> | null = null;
  let directory: {
    locations: Awaited<ReturnType<typeof getWhoami>>['locations'];
    staff: Awaited<ReturnType<typeof listStaff>>['staff'];
    services: Awaited<ReturnType<typeof listServices>>['services'];
    clients: Awaited<ReturnType<typeof listClients>>['clients'];
    tenantId: string | null;
  } | null = null;

  try {
    const [list, whoami, staffData, servicesData, clientsData] =
      await Promise.all([
        listMediaAssets({
          ownerType,
          ownerId,
          accessClass,
          folder,
          includeArchived,
          take: PAGE_SIZE,
          skip,
        }),
        getWhoami(),
        listStaff({ active: true, take: 100 }),
        listServices({ active: true, take: 200 }),
        listClients({ take: 100 }),
      ]);
    listing = list;
    directory = {
      locations: whoami.locations,
      staff: staffData.staff,
      services: servicesData.services,
      clients: clientsData.clients,
      tenantId: whoami.user.tenantId,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      directoryError = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      directoryError = err.message;
    } else {
      throw err;
    }
  }

  // Drawer drilldown — only fetch the selected asset detail (with its
  // computed displayUrl) when the URL says the drawer is open.
  let selected: Awaited<ReturnType<typeof getMediaAsset>> | null = null;
  let selectedError: string | null = null;
  if (sp.selected && !directoryError) {
    try {
      selected = await getMediaAsset(sp.selected);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        selectedError = 'Media asset not found.';
      } else if (err instanceof ApiError) {
        selectedError = err.message;
      } else {
        throw err;
      }
    }
  }

  if (directoryError || !directory || !listing) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">Media</h1>
        <Alert tone="error">
          {directoryError ?? 'Failed to load media library.'}
        </Alert>
      </div>
    );
  }

  return (
    <MediaLibrary
      assets={listing.assets}
      total={listing.total}
      pageSize={PAGE_SIZE}
      skip={skip}
      filters={{
        ownerType,
        ownerId,
        accessClass,
        folder,
        includeArchived,
      }}
      directory={directory}
      selected={selected}
      selectedError={selectedError}
      uploadOpen={uploadOpen}
    />
  );
}
