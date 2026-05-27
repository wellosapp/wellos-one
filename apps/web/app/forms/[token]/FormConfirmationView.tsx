// Post-submit confirmation screen for the public form filler (PR 7).
//
// PR 12 added the optional "Download a copy (PDF)" link. The token comes
// from the parent component (FormCompletionView) and points at the same
// magic-link credential that authorized the submission — so the link
// stays valid until token revocation (resend / cancel / expiry).

interface FormConfirmationViewProps {
  formTitle: string;
  clientFirstName: string | null;
  /** Magic-link token — when provided, renders the PDF download link. */
  token?: string;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

export function FormConfirmationView({
  formTitle,
  clientFirstName,
  token,
}: FormConfirmationViewProps) {
  const pdfHref = token
    ? `${API_BASE_URL}/public/forms/${token}/pdf`
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-s5 py-s8">
      <div className="w-full max-w-[480px] rounded-2xl border border-surface-3 bg-white px-s6 py-s8 text-center shadow-sm">
        <div className="mx-auto mb-s4 grid h-14 w-14 place-items-center rounded-full bg-sage-tint">
          <svg
            width={28}
            height={28}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sage-deep"
            aria-hidden
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <h1 className="font-display text-[26px] leading-tight text-ink">
          {clientFirstName ? `All set, ${clientFirstName}!` : 'All set!'}
        </h1>
        <p className="mt-s3 t-body-md text-ink-soft">
          Your {formTitle} was submitted.
        </p>
        {pdfHref ? (
          <p className="mt-s4 t-body-sm">
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="text-sage-deep underline decoration-sage-deep/40 underline-offset-2 hover:decoration-sage-deep"
            >
              Download a copy (PDF)
            </a>
          </p>
        ) : null}
        <p className="mt-s5 t-body-sm text-ink-soft">
          Your provider will review this before your appointment. You can
          close this window.
        </p>
      </div>
    </div>
  );
}
