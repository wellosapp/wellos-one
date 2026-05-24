'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { Button } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-s4 px-s6 py-s12">
      <h1 className="t-display-lg">Something went wrong</h1>
      <p className="t-body-md text-ink-soft">
        An unexpected error occurred. We&apos;ve been notified.
      </p>
      {(error.digest || error.message) && (
        <details className="rounded-md border border-line bg-surface-2 p-s4 t-body-sm text-ink-3">
          <summary className="cursor-pointer font-medium text-ink-2">
            Technical details
          </summary>
          {error.digest && (
            <p className="mt-s2 font-mono text-[12px]">
              digest: {error.digest}
            </p>
          )}
          {error.message && (
            <p className="mt-s1 whitespace-pre-wrap font-mono text-[12px]">
              {error.message}
            </p>
          )}
        </details>
      )}
      <div>
        <Button type="button" variant="primary" size="md" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
