import { cache } from 'react';

import { ApiError } from '@/lib/api/client';
import { getClient } from '@/lib/api/clients';
import type { Service } from '@/lib/api/services';
import { listServices } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import { listStaff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';
import { getWhoami } from '@/lib/api/whoami';

/** Same shape as `ClientQuickBookDirectory` in `ClientDetailShell`. */
export type QuickBookDirectoryPayload = {
  services: Service[];
  staff: Staff[];
  locations: WhoamiLocation[];
};

const emptyDirectory: QuickBookDirectoryPayload = {
  services: [],
  staff: [],
  locations: [],
};

/** Per-request dedupe when layout + page both need the same client row. */
export const loadClientDetail = cache(async (id: string) => {
  const result = await getClient(id);
  return result.client;
});

/** Services + staff + locations for Quick Book — shared by layout and Book tab. */
export async function loadQuickBookCatalog(): Promise<{
  directory: QuickBookDirectoryPayload;
  directoryError: string | null;
}> {
  try {
    const [staffData, servicesData, whoami] = await Promise.all([
      listStaff({ active: true, take: 100 }),
      listServices({ active: true, take: 200 }),
      getWhoami(),
    ]);
    return {
      directory: {
        services: servicesData.services,
        staff: staffData.staff,
        locations: whoami.locations,
      },
      directoryError: null,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { directory: emptyDirectory, directoryError: err.message };
    }
    throw err;
  }
}
