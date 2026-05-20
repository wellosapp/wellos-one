import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { z } from 'zod';

import {
  StaffCalendarFeedStaffNotFoundError,
  buildStaffAppointmentsIcsCalendar,
  hashStaffCalendarFeedToken,
  loadStaffIcsAppointments,
} from '../../services/staffCalendarFeedService.js';

const StaffIcsQuerySchema = z.object({
  token: z.string().trim().min(32).max(512),
});

function zodErrorBody(err: ZodError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

/**
 * Anonymous ICS subscribe URL per docs/09-dev-handoff.md Epic 7.
 * Tenant + staff are resolved only via hashed secret — no Clerk on this route.
 */
export default async function publicCalendarFeedRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/public/calendar/staff.ics', async (request, reply) => {
    const parsed = StaffIcsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const tokenHash = hashStaffCalendarFeedToken(parsed.data.token);

    const feed = await app.prisma.staffCalendarFeedToken.findUnique({
      where: { tokenHash },
      select: { tenantId: true, staffId: true },
    });

    if (!feed) {
      return reply.code(404).type('text/plain').send('Not found.');
    }

    let staffLabel: string;
    let appointments: Awaited<ReturnType<typeof loadStaffIcsAppointments>>['appointments'];

    try {
      const loaded = await loadStaffIcsAppointments(app.prisma, {
        tenantId: feed.tenantId,
        staffId: feed.staffId,
      });
      staffLabel = loaded.staffLabel;
      appointments = loaded.appointments;
    } catch (err) {
      if (err instanceof StaffCalendarFeedStaffNotFoundError) {
        return reply.code(404).type('text/plain').send('Not found.');
      }
      throw err;
    }

    const body = buildStaffAppointmentsIcsCalendar({
      staffDisplayName: staffLabel,
      appointments,
      calendarIssuedAt: new Date(),
    });

    reply
      .header('Cache-Control', 'no-store')
      .type('text/calendar; charset=utf-8')
      .send(body);
  });
}
