import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireMagicLinkAuthFromPath } from '../../middleware/requireMagicLinkAuthFromPath.js';
import {
  PublicFormAutosaveBodySchema,
  PublicFormSubmitBodySchema,
} from '../../schemas/publicForm.js';
import {
  autosaveSubmission,
  getSubmissionForView,
  submitSubmission,
  SignatureMissingError,
  SubmissionTerminalError,
  SubmissionValidationError,
} from '../../services/publicFormService.js';
import {
  PdfNotAvailableError,
  renderSubmissionPdf,
} from '../../services/formPdfService.js';

// Public form completion routes — PR 7 of the Forms System epic.
//
// All four routes share the same auth: requireMagicLinkAuthFromPath with
// purpose='form_submission'. The token in the URL is the entire credential
// — never trust tenant/client/submission from the body or query string.
// auth.token.tenantId scopes everything; auth.intakeFormSubmission is the
// pre-loaded submission row (with `definition` included); auth.client is
// the pre-loaded client row.
//
// Surface:
//   GET   /public/forms/:token                  hydrate the renderer
//   PATCH /public/forms/:token/autosave         persist partial answers
//   POST  /public/forms/:token/submit           finalize the submission
//   POST  /public/forms/:token/files            upload a file (feature flag)
//
// File upload is gated by env.FORMS_FILE_UPLOAD_ENABLED — defaults to
// disabled so prod can ship PR 7 without blocking on R2 bucket provisioning.
// When disabled the route returns 503 + code FILE_UPLOAD_DISABLED so the
// client can render a placeholder for file_upload/image_upload fields.

function zodErrorBody(err: ZodError) {
  return {
    error: 'Bad Request',
    code: 'VALIDATION_ERROR' as const,
    message: 'Request body validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

function mapTerminalError(err: SubmissionTerminalError) {
  // 410 for 'expired' / 'cancelled' — link is gone. 409 for 'submitted' —
  // it's already done, the client can re-render in read-only.
  const codeMap: Record<string, string> = {
    expired: 'SUBMISSION_EXPIRED',
    cancelled: 'SUBMISSION_CANCELLED',
    submitted: 'SUBMISSION_ALREADY_SUBMITTED',
  };
  return {
    status: err.status,
    body: {
      error: err.status === 410 ? 'Gone' : 'Conflict',
      code: codeMap[err.submissionStatus] ?? 'SUBMISSION_TERMINAL',
      submissionStatus: err.submissionStatus,
      message: err.message,
    },
  };
}

export default async function publicFormsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ---------- GET /public/forms/:token ----------
  app.get(
    '/public/forms/:token',
    { preHandler: requireMagicLinkAuthFromPath('form_submission') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      const submission = auth.intakeFormSubmission;
      if (!submission) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission for this token is no longer available.',
        });
      }

      const userAgentHeader = request.headers['user-agent'];
      const userAgent =
        typeof userAgentHeader === 'string' ? userAgentHeader : null;

      try {
        const result = await getSubmissionForView(app.prisma, {
          submission,
          client: auth.client,
          ip: request.ip ?? null,
          userAgent,
        });
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof SubmissionTerminalError) {
          const m = mapTerminalError(err);
          return reply.code(m.status).send(m.body);
        }
        throw err;
      }
    },
  );

  // ---------- PATCH /public/forms/:token/autosave ----------
  app.patch(
    '/public/forms/:token/autosave',
    { preHandler: requireMagicLinkAuthFromPath('form_submission') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      const submission = auth.intakeFormSubmission;
      if (!submission) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission for this token is no longer available.',
        });
      }

      const body = PublicFormAutosaveBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const userAgentHeader = request.headers['user-agent'];
      const userAgent =
        typeof userAgentHeader === 'string' ? userAgentHeader : null;

      try {
        const result = await autosaveSubmission(app.prisma, {
          submission,
          answers: body.data.answers,
          ip: request.ip ?? null,
          userAgent,
        });
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof SubmissionTerminalError) {
          const m = mapTerminalError(err);
          return reply.code(m.status).send(m.body);
        }
        throw err;
      }
    },
  );

  // ---------- POST /public/forms/:token/submit ----------
  app.post(
    '/public/forms/:token/submit',
    { preHandler: requireMagicLinkAuthFromPath('form_submission') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      const submission = auth.intakeFormSubmission;
      if (!submission) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission for this token is no longer available.',
        });
      }

      const body = PublicFormSubmitBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const userAgentHeader = request.headers['user-agent'];
      const userAgent =
        typeof userAgentHeader === 'string' ? userAgentHeader : null;
      const tenantId = auth.token.tenantId;

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'public_form.submit',
        },
        async () => {
          try {
            const result = await submitSubmission(app.prisma, {
              submission,
              client: auth.client,
              answers: body.data.answers,
              signatureData: body.data.signatureData ?? null,
              ip: request.ip ?? null,
              userAgent,
            });
            return { status: 200, body: result };
          } catch (err) {
            if (err instanceof SubmissionValidationError) {
              return {
                status: err.status,
                body: {
                  error: 'Unprocessable Entity',
                  code: err.code,
                  message: err.message,
                  errors: err.fieldErrors,
                },
              };
            }
            if (err instanceof SignatureMissingError) {
              return {
                status: err.status,
                body: {
                  error: 'Unprocessable Entity',
                  code: err.code,
                  message: err.message,
                },
              };
            }
            if (err instanceof SubmissionTerminalError) {
              return mapTerminalError(err);
            }
            throw err;
          }
        },
      );
    },
  );

  // ---------- POST /public/forms/:token/files ----------
  //
  // File upload route. Feature-flagged behind FORMS_FILE_UPLOAD_ENABLED so
  // PR 7 ships without blocking on R2 bucket provisioning (see
  // memory/cloudflare_and_storage.md + pre-launch sweep tracker R2 row).
  // When disabled the client renders file_upload/image_upload fields with
  // a placeholder "File uploads will be available soon" message — submit
  // still works without the file unless the field is required.
  //
  // Real multipart parsing + R2 upload + MediaAsset row creation lands in
  // a follow-up PR alongside the flag flip. The stub below preserves the
  // route surface so the web client can branch on the 503/code without
  // needing a separate "is feature available" probe.
  app.post(
    '/public/forms/:token/files',
    { preHandler: requireMagicLinkAuthFromPath('form_submission') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      const submission = auth.intakeFormSubmission;
      if (!submission) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission for this token is no longer available.',
        });
      }

      // Refuse uploads against terminal submissions regardless of flag —
      // the link can't accept new content past submit/expire/cancel.
      const status = submission.status;
      if (status === 'submitted' || status === 'expired' || status === 'cancelled') {
        return reply.code(409).send({
          error: 'Conflict',
          code: 'SUBMISSION_TERMINAL',
          submissionStatus: status,
          message: `Submission is in terminal status '${status}'.`,
        });
      }

      const enabled = process.env.FORMS_FILE_UPLOAD_ENABLED === 'true';
      if (!enabled) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          code: 'FILE_UPLOAD_DISABLED',
          message:
            'File uploads are not yet enabled on this environment. ' +
            'Set FORMS_FILE_UPLOAD_ENABLED=true once the R2 bucket is provisioned.',
        });
      }

      // Flag-on path is intentionally a TODO — multipart parser registration
      // and R2 wiring land in the follow-up PR (post-R2-bucket-provisioning).
      // We refuse rather than silently accept, so the client doesn't think
      // a file was stored when it wasn't.
      request.log.warn(
        { submissionId: submission.id },
        'public_forms.files: feature flag on but handler stub returning 501',
      );
      return reply.code(501).send({
        error: 'Not Implemented',
        code: 'FILE_UPLOAD_NOT_WIRED',
        message:
          'FORMS_FILE_UPLOAD_ENABLED is on but the upload handler has not yet been wired. ' +
          'See follow-up PR.',
      });
    },
  );

  // ---------- GET /public/forms/:token/pdf ----------
  //
  // PR 12 — public PDF export. The magic-link token is the credential;
  // when it's revoked (because the form was resent or cancelled or the
  // submission expired), requireMagicLinkAuthFromPath returns 401 before
  // this handler runs. Admins always have the parallel
  // /admin/intake-form-submissions/:id/pdf path which doesn't share the
  // token lifecycle.
  //
  // Only status='submitted' submissions get a PDF — drafts return 409 so
  // the confirmation-page link doesn't 500 on a stale token that points
  // at an unfinished submission.
  app.get(
    '/public/forms/:token/pdf',
    { preHandler: requireMagicLinkAuthFromPath('form_submission') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      const submission = auth.intakeFormSubmission;
      if (!submission) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'TOKEN_MISSING_SUBMISSION',
          message: 'Token is not scoped to a form submission.',
        });
      }

      try {
        const buffer = await renderSubmissionPdf(app.prisma, {
          tenantId: submission.tenantId,
          submissionId: submission.id,
        });
        return reply
          .header('Content-Type', 'application/pdf')
          .header(
            'Content-Disposition',
            `inline; filename="form-${submission.id}.pdf"`,
          )
          .send(buffer);
      } catch (err) {
        if (err instanceof PdfNotAvailableError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            status: err.status,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
