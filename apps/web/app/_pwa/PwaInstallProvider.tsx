'use client';

// Single root-mounted provider for everything PWA-shell:
//
//  1. Registers /sw.js (the same job RegisterServiceWorker used to do — see
//     git log; that component was folded in here as Option B from the PR 2
//     spec so there's one source of truth for "this is the PWA shell").
//  2. Captures `beforeinstallprompt` ONCE at the root so we don't miss the
//     event when individual banners mount later. The browser only fires this
//     event one time per page load; if we miss it we can't get it back.
//  3. Exposes `usePwaInstall()` for banners + modals to read install state
//     and trigger the native prompt.
//
// The provider intentionally renders no UI — it's a hidden coordinator. All
// install affordances (banner, iOS modal) live in their own components and
// pull state from `usePwaInstall()`.
//
// Hydration safety: every browser-only read (window, navigator, localStorage,
// matchMedia) happens inside a useEffect, gated by `mounted`. Consumers
// should treat `mounted === false` as "render nothing yet" to avoid SSR/CSR
// hydration mismatches.

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

// Subset of the BeforeInstallPromptEvent typing we actually use. The full
// interface isn't in lib.dom.d.ts; we only need `prompt()` and `userChoice`.
interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstallState {
  /** Flag is on AND we have a deferred install prompt available. */
  canInstallNative: boolean;
  /** iOS Safari can't auto-install but we can show the A2HS modal. */
  isIOSSafari: boolean;
  /** Combined: should we show ANY install affordance? */
  canPromptInstall: boolean;
  /** Trigger the native Android prompt. No-op on iOS. */
  promptNativeInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Whether the user already opened the PWA in standalone (installed). */
  isStandalone: boolean;
  /** False during SSR + initial client paint. Consumers should bail when false. */
  mounted: boolean;
}

const defaultState: PwaInstallState = {
  canInstallNative: false,
  isIOSSafari: false,
  canPromptInstall: false,
  promptNativeInstall: async () => 'unavailable',
  isStandalone: false,
  mounted: false,
};

const PwaInstallContext = createContext<PwaInstallState>(defaultState);

function detectIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  if (!isIOSDevice) return false;
  // Exclude in-app browsers + Chrome/Firefox/Edge on iOS. They share the
  // WebKit engine but don't expose A2HS the same way; spec says we treat
  // them all the same as Safari for the MVP modal copy.
  // (Chrome iOS is "CriOS", Firefox iOS is "FxiOS", Edge iOS is "EdgiOS".)
  // We DON'T early-exit here — per spec implementer judgment, show the same
  // modal regardless of which iOS browser the user is in. Detection just
  // tells us "this is iOS and beforeinstallprompt won't fire."
  return true;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // The standard query. Both Android Chrome and iOS Safari set this when
  // the PWA is launched from the home screen.
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari additionally exposes navigator.standalone. The property
  // isn't in lib.dom.d.ts; type it inline rather than reach for `any`.
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(false);
  // The actual deferred prompt event lives in a ref — it's not serializable
  // and never used in render. Storing in state would cause needless renders.
  const deferredPromptRef = useRef<BeforeInstallPromptEventLike | null>(null);

  // One-time client init: detect environment + mark mounted so consumers
  // can start rendering install UX.
  useEffect(() => {
    setMounted(true);
    setIsIOSSafari(detectIOSSafari());
    setIsStandalone(detectStandalone());
  }, []);

  // Capture beforeinstallprompt + appinstalled at root. Mounted once for
  // the lifetime of the page; we don't tear down on route change because
  // App Router keeps the layout mounted.
  useEffect(() => {
    if (!PWA_ENABLED) return undefined;
    if (typeof window === 'undefined') return undefined;

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome's default mini-infobar so we can drive the UX from
      // our own banner.
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEventLike;
      setHasDeferredPrompt(true);
    };

    const onAppInstalled = () => {
      // Once installed, drop the deferred prompt (it's now invalid) and
      // mark standalone so all install UX hides.
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Service worker registration. Same gates as the prior
  // RegisterServiceWorker component:
  //   - flag-gated
  //   - skipped on /admin (the staff/admin surface doesn't get the PWA)
  //   - browser-only
  // See public/sw.js — the SW itself also early-returns on /admin fetches
  // as a second layer of defense.
  useEffect(() => {
    if (!PWA_ENABLED) return;
    if (pathname?.startsWith('/admin')) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Intentional console — no telemetry plumbing yet. PR 4 can replace
        // with a PostHog event once that surface is wired.
        // eslint-disable-next-line no-console
        console.info('[PWA] Service worker registered', reg.scope);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[PWA] Service worker registration failed', err);
      });
  }, [pathname]);

  const promptNativeInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > => {
    const evt = deferredPromptRef.current;
    if (!evt) return 'unavailable';
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      // Whether they accepted or dismissed, the event is single-use — clear
      // it so we don't try to re-prompt with a stale event.
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      return choice.outcome;
    } catch {
      // Spec says the prompt can throw if already used or if browser
      // suppressed it. Surface as 'unavailable' so callers don't crash.
      deferredPromptRef.current = null;
      setHasDeferredPrompt(false);
      return 'unavailable';
    }
  }, []);

  const value = useMemo<PwaInstallState>(() => {
    const canInstallNative = PWA_ENABLED && hasDeferredPrompt && !isStandalone;
    const iosEligible = PWA_ENABLED && isIOSSafari && !isStandalone;
    return {
      canInstallNative,
      isIOSSafari,
      canPromptInstall: canInstallNative || iosEligible,
      promptNativeInstall,
      isStandalone,
      mounted,
    };
  }, [hasDeferredPrompt, isIOSSafari, isStandalone, mounted, promptNativeInstall]);

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall(): PwaInstallState {
  return useContext(PwaInstallContext);
}
