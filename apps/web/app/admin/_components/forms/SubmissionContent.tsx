// Shared read-only submission viewer — renders the form answers, captured
// signature card and any file uploads. Used by:
//   - /admin/forms/review-queue/[id]   (PR 9 — provider review surface)
//   - /admin/clients/[id]/intake/[submissionId]  (PR 10 — client-profile detail)
//
// Reuses the admin builder's FormPreviewRenderer in read-only mode so all
// 16 field types render identically to how they appear in the builder
// preview, including conditional visibility against the captured answers.

import { Card } from '@/components/ui';

import { FormPreviewRenderer } from '@/app/admin/intake-forms/builder/FormPreviewRenderer';
import { normalizeSchema } from '@/app/admin/intake-forms/_schema-utils';

interface SubmissionContentProps {
  schema: unknown;
  answers: Record<string, unknown>;
  signatureData: unknown;
  submittedAt: string | null;
  clientName: string | null;
  fileUploads: Array<{
    id: string;
    fieldKey: string;
    mediaAssetId: string;
    mediaAssetUrl: string | null;
  }>;
}

interface SignatureBlob {
  imageBase64?: string;
  typedSignature?: string;
  signedAt?: string;
  ip?: string | null;
  userAgent?: string | null;
  formVersion?: number;
}

function isSignatureBlob(v: unknown): v is SignatureBlob {
  return typeof v === 'object' && v !== null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SubmissionContent({
  schema,
  answers,
  signatureData,
  submittedAt,
  clientName,
  fileUploads,
}: SubmissionContentProps) {
  const normalizedSchema = normalizeSchema(schema);
  const sig = isSignatureBlob(signatureData) ? signatureData : null;

  return (
    <div className="flex flex-col gap-s5">
      <FormPreviewRenderer
        schema={normalizedSchema}
        initialValues={answers}
        readOnly
      />

      {sig ? (
        <Card padding="lg" className="rounded-lg border border-surface-3 bg-white shadow-sm">
          <h3 className="t-display-md text-ink">Signature</h3>
          {sig.imageBase64 ? (
            // Captured signature is a data-URI base64 image. Plain <img> — next/image
            // can't optimize an inline base64 source.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sig.imageBase64}
              alt="Captured signature"
              className="mt-s4 max-h-[180px] w-full max-w-[480px] rounded-sm border border-surface-3 bg-white object-contain"
            />
          ) : sig.typedSignature ? (
            <p className="mt-s4 font-display text-[24px] text-ink">
              {sig.typedSignature}
            </p>
          ) : (
            <p className="mt-s4 t-body-sm text-ink-soft italic">
              Signature captured but no image or typed text on file.
            </p>
          )}
          <dl className="mt-s4 grid grid-cols-1 gap-s2 t-caption text-ink-soft sm:grid-cols-2">
            {sig.signedAt ? (
              <>
                <dt>Signed at</dt>
                <dd>{formatDateTime(sig.signedAt)}</dd>
              </>
            ) : null}
            {sig.ip ? (
              <>
                <dt>IP address</dt>
                <dd className="font-mono">{sig.ip}</dd>
              </>
            ) : null}
            {sig.userAgent ? (
              <>
                <dt>User agent</dt>
                <dd
                  className="truncate font-mono"
                  title={sig.userAgent}
                >
                  {sig.userAgent}
                </dd>
              </>
            ) : null}
            {sig.formVersion !== undefined ? (
              <>
                <dt>Form version</dt>
                <dd>v{sig.formVersion}</dd>
              </>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {fileUploads.length > 0 ? (
        <Card padding="lg" className="rounded-lg border border-surface-3 bg-white shadow-sm">
          <h3 className="t-display-md text-ink">File uploads</h3>
          <ul className="mt-s4 flex flex-col gap-s3">
            {fileUploads.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-s3 rounded-sm border border-surface-3 bg-surface-2/40 px-s4 py-s3"
              >
                <div className="flex flex-col gap-s1">
                  <span className="t-body-sm font-medium text-ink">
                    Field: {f.fieldKey}
                  </span>
                  <span className="t-caption font-mono text-ink-soft">
                    {f.mediaAssetUrl ?? 'Pending file storage'}
                  </span>
                </div>
                <span className="t-caption text-ink-soft">
                  Media ID {f.mediaAssetId.slice(0, 8)}…
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-s3 t-caption text-ink-soft">
            Signed download URLs will be wired alongside the file upload flow.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-s4 border-t border-surface-3 pt-s4 t-caption text-ink-soft">
        {submittedAt ? (
          <span>Submitted {formatDateTime(submittedAt)}</span>
        ) : null}
        {clientName ? <span>by {clientName}</span> : null}
      </div>
    </div>
  );
}
