// Forms System PR 12 — public empty-state for the bare /forms URL.
//
// The interactive form filler lives at /forms/[token]. Hitting /forms with
// no token is usually a truncated email link or a bot probe. Before PR 12
// this fell through to Next.js's default 404, which still mounted the
// app's providers tree — including Clerk JS, which has been crashing on
// outdated mobile browsers per a 2026-05-27 Sentry alert.
//
// This page renders a calm warm-cream empty-state in plain HTML — no
// Clerk, no admin chrome, no client-side JS beyond what Next ships by
// default. Tailwind tokens are inlined to surface tokens / ink token /
// sage tint, matching the rest of the public forms surface (see
// FormErrorState).
//
// `force-dynamic` keeps Next from prerendering at build time — not
// strictly necessary for a static page, but mirrors the /forms/[token]
// page so behavior stays consistent.

import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function FormsEmptyStatePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-s5 py-s8">
      <div className="w-full max-w-[480px] rounded-2xl border border-surface-3 bg-white px-s6 py-s8 text-center shadow-sm">
        <div
          className="mx-auto mb-s4 grid h-14 w-14 place-items-center rounded-full bg-sage-tint"
          aria-hidden
        >
          <svg
            width={26}
            height={26}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-sage-deep"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </div>
        <h1 className="font-display text-[24px] leading-tight text-ink">
          Looking for a form?
        </h1>
        <p className="mt-s3 t-body-md text-ink-soft">
          This link is incomplete. Check the most recent email or text from
          your studio for the latest form link.
        </p>
        <p className="mt-s4 t-body-sm text-ink-soft">
          If you believe this is a mistake, please contact your studio
          directly.
        </p>
        <p className="mt-s6 t-caption text-ink-soft">
          <Link href="/" className="underline underline-offset-2">
            Back to Wellos
          </Link>
        </p>
      </div>
    </div>
  );
}
