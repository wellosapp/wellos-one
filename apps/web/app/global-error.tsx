'use client';

// Required by Sentry to capture errors thrown in the root layout (or
// nested layouts that error before reaching app/error.tsx). Without this
// file, root-layout errors silently bypass Sentry.
//
// See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-a-custom-nextjs-error-page

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
