'use client';

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
    // Sentry capture wired in a follow-up PR.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-s4 px-s6 py-s12">
      <h1 className="t-display-lg">Something went wrong</h1>
      <p className="t-body-md text-ink-soft">
        An unexpected error occurred. We&apos;ve been notified.
      </p>
      <div>
        <Button type="button" variant="primary" size="md" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
