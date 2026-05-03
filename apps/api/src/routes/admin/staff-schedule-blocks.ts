import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import {
  isPrivilegedCalendarUser,
  resolveStaffMemberIdForUser,
} from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateStaffScheduleBlockBodySchema,
  ListStaffScheduleBlocksQuerySchema,
  StaffScheduleBlockIdParamsSchema,
  UpdateStaffScheduleBlockBodySchema,
} from '../../schemas/staffScheduleBlock.js';
import {
  InvalidStaffScheduleBlockReferenceError,
  StaffScheduleBlockInvalidRangeError,
  StaffScheduleBlockNotFoundError,
  createStaffScheduleBlock,
  listStaffScheduleBlocks,
  softDeleteStaffScheduleBlock,
  updateStaffScheduleBlock,
} from '../../services/staffScheduleBlockService.js';

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

export default async function staffScheduleBlocksRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/staff-schedule-blocks',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListStaffScheduleBlocksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      if (!isPrivilegedCalendarUser(user)) {
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId || parsed.data.staffId !== selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message:
              'You can only load schedule blocks for your own calendar.',
          });
        }
      }

      const result = await listStaffScheduleBlocks(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  app.post(
    '/staff-schedule-blocks',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateStaffScheduleBlockBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      if (!isPrivilegedCalendarUser(user)) {
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId || parsed.data.staffId !== selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message:
              'You can only create blocks on your own schedule.',
          });
        }
      }

      try {
        const result = await createStaffScheduleBlock(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof InvalidStaffScheduleBlockReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  app.patch(
    '/staff-schedule-blocks/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const paramsParsed = StaffScheduleBlockIdParamsSchema.safeParse(
        request.params,
      );
      if (!paramsParsed.success) {
        return reply.code(400).send(zodErrorBody(paramsParsed.error));
      }

      const bodyParsed = UpdateStaffScheduleBlockBodySchema.safeParse(
        request.body,
      );
      if (!bodyParsed.success) {
        return reply.code(400).send(zodErrorBody(bodyParsed.error));
      }

      if (!isPrivilegedCalendarUser(user)) {
        const row = await app.prisma.staffScheduleBlock.findFirst({
          where: {
            id: paramsParsed.data.id,
            tenantId,
            deletedAt: null,
          },
          select: { staffId: true },
        });
        if (!row) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Schedule block not found.',
          });
        }
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId || row.staffId !== selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'You can only edit blocks on your own schedule.',
          });
        }
      }

      try {
        const result = await updateStaffScheduleBlock(app.prisma, {
          tenantId,
          actorUserId: user.id,
          blockId: paramsParsed.data.id,
          body: bodyParsed.data,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof StaffScheduleBlockNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        if (err instanceof StaffScheduleBlockInvalidRangeError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'endsAt', message: err.message }],
          });
        }
        if (err instanceof InvalidStaffScheduleBlockReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  app.delete(
    '/staff-schedule-blocks/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const paramsParsed = StaffScheduleBlockIdParamsSchema.safeParse(
        request.params,
      );
      if (!paramsParsed.success) {
        return reply.code(400).send(zodErrorBody(paramsParsed.error));
      }

      if (!isPrivilegedCalendarUser(user)) {
        const row = await app.prisma.staffScheduleBlock.findFirst({
          where: {
            id: paramsParsed.data.id,
            tenantId,
            deletedAt: null,
          },
          select: { staffId: true },
        });
        if (!row) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Schedule block not found.',
          });
        }
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId || row.staffId !== selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: 'You can only delete blocks on your own schedule.',
          });
        }
      }

      try {
        await softDeleteStaffScheduleBlock(app.prisma, {
          tenantId,
          actorUserId: user.id,
          blockId: paramsParsed.data.id,
        });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof StaffScheduleBlockNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
