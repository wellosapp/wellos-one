'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

if (typeof window !== 'undefined') {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com';

  if (key) {
    posthog.init(key, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
    });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // hook for any future provider setup
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
