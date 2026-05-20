'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query. Defaults to false until mounted to avoid
 * SSR/client hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}
