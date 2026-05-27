// Forms System PR 12 — server-side PDF generation for a submitted form.
//
// Loads the submission with everything needed for SubmissionDocument, then
// renders to a Buffer via @react-pdf/renderer. Only `status='submitted'`
// submissions are exportable — anything else throws PdfNotAvailableError so
// the route can emit a 409 with code PDF_NOT_AVAILABLE.
//
// Memory note: renderToBuffer holds the entire PDF in memory. Typical
// forms are 20-50 fields and stay well under a few MB. If forms ever grow
// to thousands of fields, look at the streaming renderer (renderToStream)
// as a follow-up — out of scope for MVP.

import { renderToBuffer } from '@react-pdf/renderer';

import type { ExtendedPrismaClient } from '../db/client.js';
import {
  SubmissionDocument,
  type SignatureData,
  type SubmissionDocumentProps,
} from '../pdf/SubmissionDocument.js';

// ---------- Errors ----------

export class PdfSubmissionNotFoundError extends Error {
  readonly code = 'INTAKE_FORM_SUBMISSION_NOT_FOUND' as const;
  constructor(public submissionId: string) {
    super(`Submission ${submissionId} not found`);
    this.name = 'PdfSubmissionNotFoundError';
  }
}

export class PdfNotAvailableError extends Error {
  readonly code = 'PDF_NOT_AVAILABLE' as const;
  constructor(public status: string) {
    super(`PDF not available for submission in status '${status}'`);
    this.name = 'PdfNotAvailableError';
  }
}

// ---------- Brand color extraction ----------
//
// Tenant.brandColors is a Json column with shape [{name, hex}, ...].
// Empty array means "use Wellos defaults". We pick the first valid entry
// as the accent — Phase 1 of the brand-settings epic doesn't distinguish
// primary vs accent yet. SubmissionDocument falls back to its own default
// sage if this returns null.

function pickAccentHex(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const hex = (entry as { hex?: unknown }).hex;
    if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) {
      return hex;
    }
  }
  return null;
}

// Defensive coercion for the JSON signature_data column.
function coerceSignatureData(raw: unknown): SignatureData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: SignatureData = {};
  if (typeof obj.imageBase64 === 'string') out.imageBase64 = obj.imageBase64;
  if (typeof obj.typedSignature === 'string') {
    out.typedSignature = obj.typedSignature;
  }
  if (typeof obj.signedAt === 'string') out.signedAt = obj.signedAt;
  if (typeof obj.ip === 'string') out.ip = obj.ip;
  if (typeof obj.userAgent === 'string') out.userAgent = obj.userAgent;
  if (typeof obj.formVersion === 'number') out.formVersion = obj.formVersion;
  if (!out.imageBase64 && !out.typedSignature) return null;
  return out;
}

// ---------- renderSubmissionPdf ----------

export interface RenderSubmissionPdfArgs {
  tenantId: string;
  submissionId: string;
}

export async function renderSubmissionPdf(
  prisma: ExtendedPrismaClient,
  args: RenderSubmissionPdfArgs,
): Promise<Buffer> {
  const row = await prisma.intakeFormSubmission.findFirst({
    where: { id: args.submissionId, tenantId: args.tenantId },
    include: {
      definition: true,
      tenant: {
        select: {
          id: true,
          name: true,
          brandColors: true,
        },
      },
      client: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      appointment: {
        select: {
          scheduledStartAt: true,
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!row) {
    throw new PdfSubmissionNotFoundError(args.submissionId);
  }

  if (row.status !== 'submitted') {
    throw new PdfNotAvailableError(row.status);
  }

  const props: SubmissionDocumentProps = {
    tenantName: row.tenant.name,
    tenantBrandAccentHex: pickAccentHex(row.tenant.brandColors),
    submission: {
      id: row.id,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      signatureData: coerceSignatureData(row.signatureData),
    },
    definition: {
      title: row.definition.title,
      description: row.definition.description,
      formType: row.definition.formType,
      version: row.definition.version,
      schemaRaw: row.definition.schema,
    },
    answers: (row.answers as Record<string, unknown>) ?? {},
    client: row.client
      ? {
          firstName: row.client.firstName,
          lastName: row.client.lastName,
          email: row.client.email,
          phone: row.client.phone,
        }
      : null,
    appointment: row.appointment
      ? {
          scheduledStartAt: row.appointment.scheduledStartAt.toISOString(),
          serviceName: row.appointment.service?.name ?? null,
        }
      : null,
    generatedAt: new Date(),
  };

  // SubmissionDocument is a function component returning a <Document>
  // element. Calling it directly (rather than React.createElement) gives
  // renderToBuffer the DocumentElement it expects without the wrapping
  // FunctionComponentElement layer.
  const documentElement = SubmissionDocument(props);
  return renderToBuffer(documentElement);
}
