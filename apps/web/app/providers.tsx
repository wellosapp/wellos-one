'use client';

// PostHog provider wraps the entire app on the client side. Initialization
// runs once when this component mounts in the browser. Keys come from
// NEXT_PUBLIC_* env vars baked into the bundle at build time (so they're
// frontend-safe — see PostHog's "publishable" key model).
//
// See https://posthog.com/docs/libraries/next-js

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com';

  if (key) {
    posthog.init(key, {
      api_host: host,
      // 'identified_only' = no PII captured for anonymous users until we
      // call posthog.identify() with a user ID. Safer default than 'always'.
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      // Mask all input values by default. We can opt-in specific fields
      // (search boxes, etc.) when we want to capture them.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
    });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialization happens at module load (above). This effect is a
    // hook for any future provider setup that needs DOM access.
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
