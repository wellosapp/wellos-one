import type { ExtendedPrismaClient } from '../db/client.js';
import type { CurrentUser } from '../types/fastify.js';

/** Admin and manager see full calendar + directory; staff is scoped to own column. */
export function isPrivilegedCalendarUser(user: CurrentUser): boolean {
  return user.roles.includes('admin') || user.roles.includes('manager');
}

/**
 * Match signed-in user email to an active Staff row in the tenant (Work email).
 * Used to scope staff-role appointment reads/writes to the provider's column.
 */
export async function resolveStaffMemberIdForUser(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const rows = await prisma.staff.findMany({
    where: { tenantId, deletedAt: null, active: true },
    select: { id: true, email: true },
  });
  const hit = rows.find((s) => s.email?.trim().toLowerCase() === target);
  return hit?.id ?? null;
}

export type StaffAppointmentScope =
  | 'ok'
  | 'no_staff_profile'
  | 'forbidden';

/** Staff without admin/manager may only touch appointments on their own column. */
export async function staffAppointmentScope(
  prisma: ExtendedPrismaClient,
  user: CurrentUser,
  tenantId: string,
  appointmentStaffId: string,
): Promise<StaffAppointmentScope> {
  if (isPrivilegedCalendarUser(user)) return 'ok';
  const selfId = await resolveStaffMemberIdForUser(prisma, tenantId, user.email);
  if (!selfId) return 'no_staff_profile';
  if (appointmentStaffId !== selfId) return 'forbidden';
  return 'ok';
}
