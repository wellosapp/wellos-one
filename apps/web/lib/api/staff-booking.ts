import type { StaffBookingClientContextResponse } from '@/lib/staff-booking/client-context-types';

import { apiFetch } from './client';

export async function getStaffBookingClientContext(params: {
  clientId: string;
  serviceId?: string;
  staffId?: string;
}): Promise<StaffBookingClientContextResponse> {
  return apiFetch<StaffBookingClientContextResponse>(
    '/admin/staff-booking/client-context',
    {
      searchParams: {
        clientId: params.clientId,
        serviceId: params.serviceId,
        staffId: params.staffId,
      },
    },
  );
}
