// Type-safe wrapper for /admin/class-check-in-attempts. PR 10 of the
// Geofence Auto Check-in epic — admin fraud-audit list backing.

import { apiFetch } from './client';

export type ClassCheckInAttemptResult =
  | 'success'
  | 'out_of_range'
  | 'out_of_window'
  | 'low_accuracy'
  | 'suspicious_pattern'
  | 'rate_limited'
  | 'error';

export type ClassCheckInAttempt = {
  id: string;
  classBookingId: string;
  clientId: string;
  attemptedAt: string;
  method: string;
  result: string;
  submittedLat: number | null;
  submittedLng: number | null;
  submittedAccuracyMeters: number | null;
  distanceFromGeofenceMeters: number | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
  };
  classInstance: {
    id: string;
    scheduledStartAt: string;
    className: string;
  };
};

export type ListClassCheckInAttemptsResponse = {
  attempts: ClassCheckInAttempt[];
  nextCursor: string | null;
};

export type ListClassCheckInAttemptsParams = {
  from?: string;
  to?: string;
  result?: ClassCheckInAttemptResult;
  classInstanceId?: string;
  cursor?: string;
  take?: number;
};

export async function listClassCheckInAttempts(
  params: ListClassCheckInAttemptsParams = {},
): Promise<ListClassCheckInAttemptsResponse> {
  return apiFetch<ListClassCheckInAttemptsResponse>(
    '/admin/class-check-in-attempts',
    {
      searchParams: {
        from: params.from,
        to: params.to,
        result: params.result,
        classInstanceId: params.classInstanceId,
        cursor: params.cursor,
        take: params.take,
      },
    },
  );
}
