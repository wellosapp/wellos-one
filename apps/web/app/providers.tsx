'use client';

// ClerkProvider wraps PostHog so a future posthog.identify(clerkUserId) hook
// can read useUser() without rearranging the tree. Auth env (publishableKey)
// auto-resolves from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
//
// PostHog provider wraps the rest of the app on the client side. Init runs
// once at module load. Keys come from NEXT_PUBLIC_* env vars baked into the
// bundle at build time (frontend-safe).
//
// See https://clerk.com/docs/quickstarts/nextjs
// See https://posthog.com/docs/libraries/next-js

import { ClerkProvider } from '@clerk/nextjs';
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

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <PostHogProvider client={posthog}>{children}</PostHogProvider>
    </ClerkProvider>
  );
}
