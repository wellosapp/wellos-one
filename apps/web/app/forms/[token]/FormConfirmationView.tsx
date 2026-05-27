// Post-submit confirmation screen for the public form filler (PR 7).
//
// No download / PDF link yet — PR 12 wires that. Intentionally bare: warm
// success card + "you can close this window" caption.

interface FormConfirmationViewProps {
  formTitle: string;
  clientFirstName: string | null;
}

export function FormConfirmationView({
  formTitle,
  clientFirstName,
}: FormConfirmationViewProps) {
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
        <p className="mt-s5 t-body-sm text-ink-soft">
          Your provider will review this before your appointment. You can
          close this window.
        </p>
      </div>
    </div>
  );
}
