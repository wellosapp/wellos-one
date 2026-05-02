import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import { R2NotConfiguredError } from '../../integrations/r2.js';
import {
  AppointmentIdParamsForMediaSchema,
  CompleteUploadBodySchema,
  ListMediaAssetsQuerySchema,
  MediaAssetIdParamsSchema,
  PresignUploadBodySchema,
  UpdateMediaAssetBodySchema,
} from '../../schemas/media.js';
import {
  InvalidMediaReferenceError,
  MediaUploadIncompleteError,
  completeMediaUpload,
  getDisplayUrl,
  getMediaAssetById,
  listMediaAssets,
  listMediaForAppointment,
  presignMediaUpload,
  setMediaAssetArchived,
  softDeleteMediaAsset,
  updateMediaAsset,
} from '../../services/mediaService.js';

// /admin/media — MediaAsset CRUD + presign/complete (E3-S4c).
//
// Auth: requireRole.staff for read + presign + complete (providers
// upload reference photos, staff edit captions). DELETE is admin-only.
//
// R2 not configured → all R2-touching endpoints return 503 with a
// clear message pointing at the env-var checklist. Pure-DB endpoints
// (list / get / patch / archive / delete) keep working.

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

function refErrorBody(err: InvalidMediaReferenceError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: err.field, message: err.message }],
  };
}

function r2NotConfiguredBody(err: R2NotConfiguredError) {
  return {
    error: 'Service Unavailable',
    message: err.message,
    missing: err.missing,
  };
}

function uploadIncompleteBody(err: MediaUploadIncompleteError) {
  return {
    error: 'Unprocessable Entity',
    message: err.message,
  };
}

const NOT_FOUND = {
  error: 'Not Found',
  message: 'Media asset not found.',
};

export default async function mediaRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/media/presign
  app.post(
    '/media/presign',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const body = PresignUploadBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'media_asset.presign' },
        async () => {
          try {
            const result = await presignMediaUpload(app.prisma, {
              tenantId,
              actorUserId: user.id,
              body: body.data,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidMediaReferenceError) {
              return { status: 400, body: refErrorBody(err) };
            }
            if (err instanceof R2NotConfiguredError) {
              return { status: 503, body: r2NotConfiguredBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // POST /admin/media/:id/complete
  app.post(
    '/media/:id/complete',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = CompleteUploadBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'media_asset.complete' },
        async () => {
          try {
            const result = await completeMediaUpload(app.prisma, {
              tenantId,
              actorUserId: user.id,
              id: params.data.id,
              body: body.data,
            });
            if (!result) return { status: 404, body: NOT_FOUND };
            return { status: 200, body: result };
          } catch (err) {
            if (err instanceof MediaUploadIncompleteError) {
              return { status: 422, body: uploadIncompleteBody(err) };
            }
            if (err instanceof R2NotConfiguredError) {
              return { status: 503, body: r2NotConfiguredBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET /admin/media — list with filters
  app.get(
    '/media',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const query = ListMediaAssetsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(zodErrorBody(query.error));

      const result = await listMediaAssets(app.prisma, {
        tenantId,
        query: query.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/media/:id — fetch one + computed display URL
  //
  // Display URL is computed server-side so the frontend doesn't need to
  // know whether to use the public CDN or signed-short. R2-not-configured
  // returns a 503 here too — the URL can't be built without env.
  app.get(
    '/media/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const asset = await getMediaAssetById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!asset) return reply.code(404).send(NOT_FOUND);

      try {
        const displayUrl = await getDisplayUrl(asset);
        return reply.send({ asset, displayUrl });
      } catch (err) {
        if (err instanceof R2NotConfiguredError) {
          // Return the asset metadata even without a URL — the UI can
          // still show name/size/dimensions while flagging "URL unavailable".
          return reply.send({ asset, displayUrl: null });
        }
        throw err;
      }
    },
  );

  // PATCH /admin/media/:id — caption / altText / visibility
  app.patch(
    '/media/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = UpdateMediaAssetBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      const result = await updateMediaAsset(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
        body: body.data,
      });
      if (!result) return reply.code(404).send(NOT_FOUND);
      return reply.send(result);
    },
  );

  // POST /admin/media/:id/archive  (idempotent toggle)
  app.post(
    '/media/:id/archive',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'media_asset.archive' },
        async () => {
          const result = await setMediaAssetArchived(app.prisma, {
            tenantId,
            actorUserId: user.id,
            id: params.data.id,
            archived: true,
          });
          if (!result) return { status: 404, body: NOT_FOUND };
          return { status: 200, body: result };
        },
      );
    },
  );

  // POST /admin/media/:id/unarchive
  app.post(
    '/media/:id/unarchive',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'media_asset.unarchive' },
        async () => {
          const result = await setMediaAssetArchived(app.prisma, {
            tenantId,
            actorUserId: user.id,
            id: params.data.id,
            archived: false,
          });
          if (!result) return { status: 404, body: NOT_FOUND };
          return { status: 200, body: result };
        },
      );
    },
  );

  // DELETE /admin/media/:id — soft-delete (admin-only)
  app.delete(
    '/media/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MediaAssetIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      await softDeleteMediaAsset(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
      });
      return reply.code(204).send();
    },
  );

  // GET /admin/appointments/:appointmentId/media — appointment-scoped
  // media list, grouped by category for the staff calendar drawer's
  // Files tab (E3-S6). Per buildout §6.3.
  //
  // Pure-DB read; works whether or not R2 is configured. The detail
  // endpoint (/admin/media/:id) is what resolves the displayUrl
  // per-asset, called when the operator opens a specific file.
  app.get(
    '/appointments/:appointmentId/media',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsForMediaSchema.safeParse(
        request.params,
      );
      if (!params.success)
        return reply.code(400).send(zodErrorBody(params.error));

      const result = await listMediaForAppointment(app.prisma, {
        tenantId,
        appointmentId: params.data.appointmentId,
      });
      if (!result)
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      return reply.send(result);
    },
  );
}
