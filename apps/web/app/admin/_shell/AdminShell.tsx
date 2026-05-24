'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { AdminRail } from './AdminRail';

// localStorage key for the rail's expanded/collapsed state. Per design,
// default is collapsed (data-rail="collapsed", rail width 68px). User
// preference persists across navigation + sessions.
const RAIL_STORAGE_KEY = 'wellos:admin-rail-expanded';

interface AdminShellProps {
  /** Pre-rendered topbar (server component — accepts the firstName + greeting prop). */
  topbar: ReactNode;
  /** Admin page content rendered into the main area. */
  children: ReactNode;
  /** Tenant logo (server-fetched) — falls back to LeafIcon + "Wellos" when null. */
  logo?: { id: string; displayUrl: string | null } | null;
}

export function AdminShell({ topbar, children, logo }: AdminShellProps) {
  // Client-side state for the rail. SSR renders collapsed; the first
  // effect tick reads localStorage and rehydrates the user's preference.
  // The `data-rail` attribute drives the grid template via inline style
  // (avoids depending on global CSS hooks the design uses).
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RAIL_STORAGE_KEY);
      if (stored === 'true') setExpanded(true);
    } catch {
      // localStorage unavailable (e.g., privacy mode) — silently default.
    }
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, String(next));
      } catch {
        // Swallow — feature degrades to per-session toggle if storage is blocked.
      }
      return next;
    });
  }

  return (
    <div
      data-rail={expanded ? 'expanded' : 'collapsed'}
      className="grid min-h-screen bg-canvas transition-[grid-template-columns] duration-base"
      style={{ gridTemplateColumns: `${expanded ? 220 : 68}px 1fr` }}
    >
      <AdminRail expanded={expanded} onToggle={toggle} logo={logo} />
      <main className="flex min-w-0 flex-col gap-s4 px-s8 py-s6 pb-s10">
        {topbar}
        {children}
      </main>
    </div>
  );
}
