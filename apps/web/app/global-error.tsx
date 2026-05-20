'use client';

// Required by Sentry to capture errors thrown in the root layout (or
// nested layouts that error before reaching app/error.tsx). Without this
// file, root-layout errors silently bypass Sentry.
//
// See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-a-custom-nextjs-error-page

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
          margin: 0,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#444', lineHeight: 1.5 }}>
          {isDev
            ? error.message
            : 'An unexpected error occurred. Please refresh and try again.'}
        </p>
        {error.digest ? (
          <p style={{ color: '#666', fontSize: 14 }}>Error ID: {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
