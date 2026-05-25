// Type-safe wrappers for /admin/recurrence-rules endpoints (Classes Phase 2b).
// Mirrors the Zod schemas in apps/api/src/schemas/recurrenceRule.ts. Kept in
// sync by hand at MVP — when @wellos/shared fills in, move these.

import { apiFetch } from './client';

export type ByDay = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export type RecurrenceRule = {
  id: string;
  tenantId: string;
  classId: string;
  staffId: string;
  locationId: string;
  /** ISO date (UTC midnight on the wire). */
  startDate: string;
  /** ISO date or null. */
  endDate: string | null;
  byday: ByDay[];
  /** "HH:MM" 24-hour, in the rule's timezone. */
  startTime: string;
  durationMinutes: number;
  /** IANA zone, e.g. "America/Chicago". */
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

// List/get wire shape: rule scalars + class/staff/location summaries so the
// list table can render without a second round-trip.
export type RecurrenceRuleWithRelations = RecurrenceRule & {
  class: {
    id: string;
    name: string;
    color: string | null;
    durationMinutes: number;
  };
  staff: {
    id: string;
    firstName: string;
    lastName: string | null;
    jobTitle: string | null;
  };
  location: { id: string; name: string };
};

export type ListRecurrenceRulesResponse = {
  rules: RecurrenceRuleWithRelations[];
  total: number;
};

export type ListRecurrenceRulesQuery = {
  classId?: string;
  active?: boolean;
  take?: number;
  skip?: number;
};

export async function listRecurrenceRules(
  query: ListRecurrenceRulesQuery = {},
): Promise<ListRecurrenceRulesResponse> {
  return apiFetch<ListRecurrenceRulesResponse>('/admin/recurrence-rules', {
    searchParams: {
      classId: query.classId,
      active:
        query.active === undefined ? undefined : query.active ? 'true' : 'false',
      take: query.take,
      skip: query.skip,
    },
  });
}

export async function getRecurrenceRule(
  id: string,
): Promise<{ rule: RecurrenceRuleWithRelations }> {
  return apiFetch<{ rule: RecurrenceRuleWithRelations }>(
    `/admin/recurrence-rules/${id}`,
  );
}

export type CreateRecurrenceRuleBody = {
  classId: string;
  staffId: string;
  locationId: string;
  startDate: string;
  endDate?: string | null;
  byday: ByDay[];
  startTime: string;
  durationMinutes: number;
  timezone: string;
  active?: boolean;
};

export async function createRecurrenceRule(
  body: CreateRecurrenceRuleBody,
): Promise<{ rule: RecurrenceRule }> {
  return apiFetch('/admin/recurrence-rules', { method: 'POST', body });
}

export type UpdateRecurrenceRuleBody = {
  staffId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string | null;
  byday?: ByDay[];
  startTime?: string;
  durationMinutes?: number;
  timezone?: string;
  active?: boolean;
};

export async function updateRecurrenceRule(
  id: string,
  body: UpdateRecurrenceRuleBody,
): Promise<{ rule: RecurrenceRule }> {
  return apiFetch(`/admin/recurrence-rules/${id}`, { method: 'PATCH', body });
}

export type GenerateInstancesResponse = {
  created: number;
  skipped: number;
  skippedReason?: 'rule_not_found' | 'rule_inactive' | 'window_empty';
};

export async function generateInstancesForRule(
  id: string,
  body: { horizonWeeks?: number } = {},
): Promise<GenerateInstancesResponse> {
  return apiFetch(`/admin/recurrence-rules/${id}/generate-instances`, {
    method: 'POST',
    body,
  });
}
