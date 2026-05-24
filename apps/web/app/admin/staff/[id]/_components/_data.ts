import { cache } from 'react';

import { getStaff } from '@/lib/api/staff';

/** Per-request dedupe when layout + page both need the same staff row. */
export const loadStaffDetail = cache(async (id: string) => {
  const result = await getStaff(id);
  return result.staff;
});
