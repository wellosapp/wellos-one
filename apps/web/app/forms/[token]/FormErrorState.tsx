// Warm, calm error page for the public form completion flow.
//
// Distinct copy per server-returned error code. Falls back to a generic
// "couldn't open this link" message for anything unmapped — better to
// be vague-but-friendly than expose internal codes the client can't act on.

interface FormErrorStateProps {
  code: string;
  message?: string;
  tenantName?: string;
}

const COPY: Record<string, { title: string; body: string }> = {
  MALFORMED_TOKEN: {
    title: 'This link looks broken.',
    body: 'Double-check the URL or ask for a new link.',
  },
  MISSING_TOKEN: {
    title: 'This link is incomplete.',
    body: 'The form link in your email or text seems to be missing a piece.',
  },
  INVALID_TOKEN: {
    title: "We couldn't find this form.",
    body: 'The link may have already been used or replaced by a newer one.',
  },
  TOKEN_EXPIRED: {
    title: 'This link has expired.',
    body: 'Please ask for a new form link.',
  },
  TOKEN_REVOKED: {
    title: 'This link has been replaced.',
    body: 'A more recent link was sent. Please use that one.',
  },
  TOKEN_PURPOSE_MISMATCH: {
    title: "This link can't be used here.",
    body: 'Please ask for a fresh form link.',
  },
  SUBMISSION_EXPIRED: {
    title: 'The window to complete this form has passed.',
    body: 'Please contact your provider to arrange a new link.',
  },
  SUBMISSION_CANCELLED: {
    title: 'This form was cancelled.',
    body: "It's no longer accepting answers. Reach out if you have questions.",
  },
  SUBMISSION_NOT_FOUND: {
    title: "We couldn't find this form.",
    body: 'It may have been removed. Please ask for a new link.',
  },
  SUBMISSION_ALREADY_SUBMITTED: {
    title: 'This form has already been submitted.',
    body: 'Thanks — no further action is needed.',
  },
};

const DEFAULT_COPY = {
  title: "We couldn't open this form.",
  body: 'Please try again, or contact your provider for help.',
};

export function FormErrorState({ code, message, tenantName }: FormErrorStateProps) {
  const copy = COPY[code] ?? DEFAULT_COPY;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-s5 py-s8">
      <div className="w-full max-w-[480px] rounded-2xl border border-surface-3 bg-white px-s6 py-s8 text-center shadow-sm">
        <div className="mx-auto mb-s4 grid h-14 w-14 place-items-center rounded-full bg-amber-pale/70">
          <svg
            width={26}
            height={26}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber"
            aria-hidden
          >
            <path d="M12 9v4M12 17h.01M10.3 3.86l-8.04 14a2 2 0 001.74 3h16.08a2 2 0 001.74-3l-8.04-14a2 2 0 00-3.48 0z" />
          </svg>
        </div>
        <h1 className="font-display text-[24px] leading-tight text-ink">
          {copy.title}
        </h1>
        <p className="mt-s3 t-body-md text-ink-soft">{copy.body}</p>
        {tenantName ? (
          <p className="mt-s5 t-caption text-ink-soft">
            Need help? Contact {tenantName}.
          </p>
        ) : null}
        {message && message !== copy.body ? (
          <p className="mt-s4 t-caption text-ink-soft">
            <span aria-hidden>· · ·</span>
            <br />
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
