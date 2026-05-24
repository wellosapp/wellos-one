// Type-safe wrappers for /admin/classes endpoints (Classes Phase 1).
// Mirrors the Zod schemas in apps/api/src/schemas/class.ts. Kept in sync by
// hand at MVP — when the shared types package fills in, move these to
// packages/shared.

import { apiFetch } from './client';

export type ClassCategorySummary = {
  id: string;
  name: string;
};

export type ClassInstructorSummary = {
  staffId: string;
  isPrimary: boolean;
};

export type Class = {
  id: string;
  tenantId: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  durationMinutes: number;
  basePriceCents: number;
  maxCapacity: number;
  minToRun: number;
  allowWaitlist: boolean;
  waitlistLimit: number;
  color: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  active: boolean;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// Detail endpoint augments Class with the full instructor list. List
// endpoint omits this for per-row M2M-lookup cost reasons — only
// instructorCount comes through.
export type ClassWithInstructors = Class & {
  instructors: ClassInstructorSummary[];
  category: ClassCategorySummary | null;
};

export type ClassListItem = Class & {
  instructorCount: number;
  category: ClassCategorySummary | null;
};

export type ClassWriteBody = {
  name: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  durationMinutes: number;
  basePriceCents: number;
  maxCapacity: number;
  minToRun?: number;
  allowWaitlist?: boolean;
  waitlistLimit?: number;
  color?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  active?: boolean;
  categoryId?: string | null;
  instructorIds?: string[];
};

export type ListClassesResponse = {
  classes: ClassListItem[];
  total: number;
};

export type ListClassesQuery = {
  q?: string;
  active?: boolean;
  categoryId?: string;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listClasses(
  query: ListClassesQuery = {},
): Promise<ListClassesResponse> {
  return apiFetch<ListClassesResponse>('/admin/classes', {
    searchParams: {
      q: query.q,
      active: query.active,
      categoryId: query.categoryId,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getClass(
  id: string,
): Promise<{ class: ClassWithInstructors }> {
  return apiFetch<{ class: ClassWithInstructors }>(`/admin/classes/${id}`);
}

export async function createClass(
  body: ClassWriteBody,
): Promise<{ class: ClassWithInstructors }> {
  return apiFetch('/admin/classes', { method: 'POST', body });
}

export async function updateClass(
  id: string,
  body: Partial<ClassWriteBody>,
): Promise<{ class: ClassWithInstructors }> {
  return apiFetch(`/admin/classes/${id}`, { method: 'PATCH', body });
}

export async function deleteClass(id: string): Promise<void> {
  await apiFetch(`/admin/classes/${id}`, { method: 'DELETE' });
}
