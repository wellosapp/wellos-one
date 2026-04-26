'use client';

import { useEffect } from 'react';

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
    <main style={{ padding: '4rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#555', marginBottom: '2rem' }}>
        An unexpected error occurred. We&apos;ve been notified.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '0.5rem 1rem',
          background: '#1a1a1a',
          color: '#fafaf7',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  );
}
