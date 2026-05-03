import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';

import {
  resolveStaffMemberIdForUser,
} from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';

// GET /admin/whoami — tenant + locations + optional linked Staff profile.
// Auth: staff (admin/manager/staff) so operational calendars can resolve
// default location and the signed-in provider row without admin-only gates.

const STAFF_WHOAMI_SELECT = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  workingHours: true,
  hourlyRateCents: true,
  commissionRatePct: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.StaffSelect;

export default async function whoamiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/whoami', { preHandler: requireRole.staff }, async (request) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const [tenant, locations] = await Promise.all([
      app.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      app.prisma.location.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, timezone: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const staffMemberId = await resolveStaffMemberIdForUser(
      app.prisma,
      tenantId,
      user.email,
    );
    const staffMember = staffMemberId
      ? await app.prisma.staff.findFirst({
          where: { id: staffMemberId, tenantId, deletedAt: null },
          select: STAFF_WHOAMI_SELECT,
        })
      : null;

    return {
      user,
      tenant,
      roles: user.roles,
      locations,
      staffMember,
    };
  });
}
