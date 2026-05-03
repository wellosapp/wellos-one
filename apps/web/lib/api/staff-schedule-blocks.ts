import { apiFetch } from './client';

export type StaffScheduleBlockCategory =
  | 'break'
  | 'lunch'
  | 'pto'
  | 'meeting'
  | 'training'
  | 'maintenance'
  | 'closure'
  | 'custom';

export type ScheduleBlockVisibility = 'internal' | 'public_busy';

export type StaffScheduleBlock = {
  id: string;
  tenantId: string;
  staffId: string;
  locationId: string | null;
  title: string;
  category: StaffScheduleBlockCategory;
  startsAt: string;
  endsAt: string;
  visibility: ScheduleBlockVisibility;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ListStaffScheduleBlocksResult = { blocks: StaffScheduleBlock[] };

export async function listStaffScheduleBlocks(args: {
  staffId: string;
  from: string;
  to: string;
}): Promise<ListStaffScheduleBlocksResult> {
  return apiFetch<ListStaffScheduleBlocksResult>('/admin/staff-schedule-blocks', {
    searchParams: {
      staffId: args.staffId,
      from: args.from,
      to: args.to,
    },
  });
}

export type CreateStaffScheduleBlockBody = {
  staffId: string;
  locationId?: string | null;
  title: string;
  category: StaffScheduleBlockCategory;
  startsAt: string;
  endsAt: string;
  visibility?: ScheduleBlockVisibility;
};

export async function createStaffScheduleBlock(
  body: CreateStaffScheduleBlockBody,
): Promise<{ block: StaffScheduleBlock }> {
  return apiFetch<{ block: StaffScheduleBlock }>('/admin/staff-schedule-blocks', {
    method: 'POST',
    body,
  });
}

export async function deleteStaffScheduleBlock(blockId: string): Promise<void> {
  await apiFetch<void>(`/admin/staff-schedule-blocks/${blockId}`, {
    method: 'DELETE',
  });
}
