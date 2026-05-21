'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui';

export default function ManageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface unhandled errors to the console; Sentry already auto-captures
    // via the global instrumentation.
    console.error('Manage page error', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <span className="t-display-sm font-display font-semibold text-ink">
          Wellos
        </span>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-s6 py-s8 md:px-s8">
        <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
          <span className="t-eyebrow text-accent">Manage your visit</span>
          <h1 className="mt-s2 t-display-md text-ink">Something went wrong.</h1>
          <p className="mt-s3 t-body-md text-ink-soft">
            We hit an unexpected error loading this page. Try again — if it
            keeps happening, contact the business for help.
          </p>
          <div className="mt-s5">
            <Button variant="accent" size="md" type="button" onClick={reset}>
              Try again
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
