'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Subscribes to the SSE stream of roster events for one ClassInstance and
// triggers a router.refresh() each time something changes — that re-fetches
// the server component's data so the table + capacity meter stay live.
//
// PR 10 of the Geofence Auto Check-in epic.
//
// Why router.refresh() over client-side state?
// --------------------------------------------
// The roster page is a server component that already does a parallel fetch
// of (instance, roster, summary, whoami, staffList). Refreshing re-runs that
// fetch and lets React's reconciler diff the new HTML. For a 20-30 row
// roster this is fast enough that the latency-vs-complexity tradeoff
// favours refresh — no duplicated wire types, no merge conflicts when a
// teammate edits the roster rendering, no stale-state bugs.
//
// AUTH — query-string token
// -------------------------
// EventSource can't send Authorization headers and our API lives on a
// different domain than the web app (api.wellos.one vs app.wellos.one),
// so the Clerk session cookie doesn't naturally cross. We pass the JWT
// from useAuth().getToken() as a `?token=...` query param. The server-
// side route verifies it via @clerk/backend's verifyToken. See
// apps/api/src/routes/staff/class-instances-stream.ts for the TODO on
// moving to cookie-session auth.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

// Backoff after an unrecoverable close before we attempt a reconnect via
// router.refresh (which also remounts this component). EventSource auto-
// reconnects on transient drops; this delay catches the post-server-restart
// case where the connection enters CLOSED.
const RECONNECT_DELAY_MS = 3_000;

interface RosterStreamSubscriberProps {
  instanceId: string;
}

export function RosterStreamSubscriber({
  instanceId,
}: RosterStreamSubscriberProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let eventSource: EventSource | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const open = async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      const url = new URL(
        `/staff/class-instances/${encodeURIComponent(instanceId)}/check-ins/stream`,
        API_BASE,
      );
      url.searchParams.set('token', token);

      eventSource = new EventSource(url.toString());

      eventSource.addEventListener('roster-update', () => {
        router.refresh();
      });

      eventSource.onerror = () => {
        // EventSource reconnects on transient errors automatically. Only
        // act on an explicit CLOSED state (e.g. server gone or token
        // expired) — schedule a router.refresh which will remount this
        // component and request a fresh token.
        if (eventSource?.readyState === EventSource.CLOSED) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            if (!cancelled) router.refresh();
          }, RECONNECT_DELAY_MS);
        }
      };
    };

    void open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [instanceId, getToken, isLoaded, isSignedIn, router]);

  return null;
}
