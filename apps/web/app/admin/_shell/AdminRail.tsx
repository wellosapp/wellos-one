'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import type { Route } from 'next';

import {
  ActivityIcon,
  CalendarIcon,
  ClipboardIcon,
  GridIcon,
  HourglassIcon,
  ImageIcon,
  LayoutIcon,
  LeafIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  StaffIcon,
  TagIcon,
  UserPlusIcon,
  UsersIcon,
  ZapIcon,
} from './icons';
import { RailLink } from './RailLink';
import { RailGroup } from './RailGroup';

// Admin rail — top-level navigation.
//
// Information architecture (intent-based; replaces the prior system-buckets):
//
//   Dashboard                         (top-of-rail leaf)
//   Schedule                          (top-of-rail leaf)
//   Clients & Team        (group)
//     - Clients
//     - Team
//   Services & Scheduling (group)
//     - Services
//     - Classes
//     - Service Categories
//     - Tags
//     - Waitlist
//   Intake & Onboarding   (group)
//     - Client Intake
//     - Team Onboarding
//   Automations & Activity (group)
//     - Automations
//     - Activity Log
//   Media Library                     (top-of-rail leaf)
//
//   Settings + Collapse toggle stay pinned in the footer.
//
// Routes preserved:
//   /admin                          → Dashboard
//   /admin/calendar                 → Schedule
//   /admin/clients                  → Clients
//   /admin/staff                    → Team
//   /admin/services                 → Services
//   /admin/classes                  → Classes
//   /admin/service-categories       → Service Categories
//   /admin/client-tags              → Tags
//   /admin/waitlist                 → Waitlist
//   /admin/intake-forms             → Client Intake
//   /admin/staff-onboarding-forms   → Team Onboarding
//   /admin/automations              → Automations
//   /admin/automations/runs         → Activity Log
//   /admin/media                    → Media Library
//   /admin/settings                 → Settings (footer)
//
// Routes intentionally NOT in the rail (still reachable by direct URL or
// contextual buttons elsewhere in the app):
//   /admin/forms/review-queue
//   /admin/class-check-in-attempts
//
// If/when a unified Activity Log page lands, those two can fold into it.

// ---- Types + helpers ----

type IconComponent = ComponentType<{ size?: number; className?: string }>;

interface RailLeaf {
  type: 'leaf';
  label: string;
  href: Route;
  icon: IconComponent;
}

interface RailGroupEntry {
  type: 'group';
  /** Stable id — used as localStorage key suffix and ARIA controls target. */
  id: string;
  label: string;
  icon: IconComponent;
  children: Omit<RailLeaf, 'type'>[];
}

type RailEntry = RailLeaf | RailGroupEntry;

function leaf(label: string, href: Route, icon: IconComponent): RailLeaf {
  return { type: 'leaf', label, href, icon };
}

function group(
  id: string,
  label: string,
  icon: IconComponent,
  children: Omit<RailLeaf, 'type'>[],
): RailGroupEntry {
  return { type: 'group', id, label, icon, children };
}

// ---- The IA ----

const RAIL_ENTRIES: RailEntry[] = [
  leaf('Dashboard', '/admin' as Route, LayoutIcon),
  leaf('Schedule', '/admin/calendar' as Route, CalendarIcon),
  group('clients-team', 'Clients & Team', UsersIcon, [
    { label: 'Clients', href: '/admin/clients' as Route, icon: UsersIcon },
    { label: 'Team', href: '/admin/staff' as Route, icon: StaffIcon },
  ]),
  group('services-scheduling', 'Services & Scheduling', SparkIcon, [
    { label: 'Services', href: '/admin/services' as Route, icon: SparkIcon },
    { label: 'Classes', href: '/admin/classes' as Route, icon: SparkIcon },
    {
      label: 'Service Categories',
      href: '/admin/service-categories' as Route,
      icon: GridIcon,
    },
    { label: 'Tags', href: '/admin/client-tags' as Route, icon: TagIcon },
    {
      label: 'Waitlist',
      href: '/admin/waitlist' as Route,
      icon: HourglassIcon,
    },
  ]),
  group('intake-onboarding', 'Intake & Onboarding', ClipboardIcon, [
    {
      label: 'Client Intake',
      href: '/admin/intake-forms' as Route,
      icon: ClipboardIcon,
    },
    {
      label: 'Team Onboarding',
      href: '/admin/staff-onboarding-forms' as Route,
      icon: UserPlusIcon,
    },
  ]),
  group('automations-activity', 'Automations & Activity', ZapIcon, [
    {
      label: 'Automations',
      href: '/admin/automations' as Route,
      icon: ActivityIcon,
    },
    {
      label: 'Activity Log',
      href: '/admin/automations/runs' as Route,
      icon: ShieldIcon,
    },
  ]),
  leaf('Media Library', '/admin/media' as Route, ImageIcon),
];

// `/admin` matches only the exact root; every other route matches by prefix,
// so e.g. /admin/clients/abc/notes activates Clients.
//
// /admin/automations is special-cased so its prefix does NOT swallow
// /admin/automations/runs (its sibling Activity Log entry).
function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/admin') return pathname === '/admin';
  if (itemHref === '/admin/automations') {
    return (
      pathname === '/admin/automations' ||
      (pathname.startsWith('/admin/automations/') &&
        !pathname.startsWith('/admin/automations/runs'))
    );
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

function groupHasActiveChild(g: RailGroupEntry, pathname: string): boolean {
  return g.children.some((c) => isActive(c.href, pathname));
}

// localStorage key prefix for per-group open state. Each group's id is
// appended (e.g. `wellos:admin-rail-group:clients-team`). Default = open.
const GROUP_STORAGE_PREFIX = 'wellos:admin-rail-group:';

function readStoredGroupOpen(id: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(`${GROUP_STORAGE_PREFIX}${id}`);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredGroupOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(
      `${GROUP_STORAGE_PREFIX}${id}`,
      String(open),
    );
  } catch {
    // Storage unavailable (privacy mode) — feature degrades silently.
  }
}

// Stable list of group ids — module-scope so it doesn't churn render-to-render.
const ALL_GROUP_IDS: readonly string[] = RAIL_ENTRIES.filter(
  (e): e is RailGroupEntry => e.type === 'group',
).map((g) => g.id);

// ---- Root ----

interface AdminRailProps {
  expanded: boolean;
  onToggle: () => void;
  /** Tenant logo from server-side fetch. Falls back to LeafIcon + "Wellos" when null. */
  logo?: { id: string; displayUrl: string | null } | null;
}

export function AdminRail({ expanded, onToggle, logo }: AdminRailProps) {
  const pathname = usePathname();
  const settingsActive = isActive('/admin/settings', pathname);
  const hasLogo = !!logo?.displayUrl;

  // SSR + first client paint use default-open for every group; the effect
  // below rehydrates from localStorage. This avoids a hydration mismatch
  // without disabling SSR.
  const [openByGroupId, setOpenByGroupId] = useState<Record<string, boolean>>(
    () => Object.fromEntries(ALL_GROUP_IDS.map((id) => [id, true])),
  );
  useEffect(() => {
    setOpenByGroupId((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const id of ALL_GROUP_IDS) {
        const stored = readStoredGroupOpen(id);
        if (stored !== null) next[id] = stored;
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setOpenByGroupId((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeStoredGroupOpen(id, next[id] ?? true);
      return next;
    });
  }, []);

  // Curried matcher passed to RailGroup so it doesn't need to import
  // isActive + pathname itself.
  const checkActive = useCallback(
    (href: string) => isActive(href, pathname),
    [pathname],
  );

  return (
    <aside
      aria-label="Admin navigation"
      className="sticky top-0 z-10 flex h-screen flex-col gap-s1 border-r border-line bg-surface px-s2 py-s4"
    >
      <Link
        href={'/admin' as Route}
        aria-label="Wellos admin home"
        className="flex shrink-0 items-center gap-s3 overflow-hidden whitespace-nowrap px-s2 pb-s4 pt-s1 text-ink no-underline focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
      >
        {hasLogo ? (
          // Signed R2 URLs expire and can't be optimized by next/image
          // without domain config. Plain <img> mirrors FileTile.tsx.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo!.displayUrl!}
            alt=""
            className={[
              'h-8 shrink-0 object-contain transition-[width,max-width] duration-base',
              expanded ? 'w-auto max-w-[140px]' : 'w-8 max-w-8',
            ].join(' ')}
          />
        ) : (
          <>
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sage text-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
            >
              <LeafIcon size={18} />
            </span>
            <span
              className={[
                'font-display text-[22px] leading-none tracking-[-0.01em] transition-[opacity,transform] duration-base',
                expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0',
              ].join(' ')}
            >
              Wellos
            </span>
          </>
        )}
      </Link>

      {/*
        Scrollable middle. The new IA fits on most viewports without scroll,
        but overflow-y-auto + min-h-0 stay as a safety net for tall-content
        edge cases (every group open on a short viewport).
      */}
      <nav className="flex min-h-0 flex-1 flex-col gap-s1 overflow-y-auto">
        {RAIL_ENTRIES.map((entry) => {
          if (entry.type === 'leaf') {
            return (
              <RailLink
                key={entry.href}
                href={entry.href}
                label={entry.label}
                Icon={entry.icon}
                active={isActive(entry.href, pathname)}
                expanded={expanded}
              />
            );
          }
          const childActive = groupHasActiveChild(entry, pathname);
          const userOpen = openByGroupId[entry.id] ?? true;
          // Force-open when a child route is active — never strand the user
          // in a collapsed group whose child they just navigated to.
          const open = childActive ? true : userOpen;
          return (
            <RailGroup
              key={entry.id}
              id={entry.id}
              label={entry.label}
              Icon={entry.icon}
              items={entry.children}
              expanded={expanded}
              open={open}
              onToggle={() => toggleGroup(entry.id)}
              isActive={checkActive}
            />
          );
        })}
      </nav>

      <div className="flex shrink-0 flex-col gap-s1 border-t border-line pt-s3">
        <RailLink
          href={'/admin/settings' as Route}
          label="Settings"
          Icon={SettingsIcon}
          active={settingsActive}
          expanded={expanded}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          className="mt-s1 flex items-center gap-s3 rounded-sm border-0 bg-transparent px-s3 py-[10px] text-left text-[12.5px] font-medium text-ink-4 transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink-2 focus-visible:shadow-focus focus-visible:outline-none"
        >
          {expanded ? (
            <PanelLeftIcon size={18} className="shrink-0 max-w-none" />
          ) : (
            <PanelRightIcon size={18} className="shrink-0 max-w-none" />
          )}
          <span
            className={[
              'whitespace-nowrap transition-[opacity,transform] duration-base',
              expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0',
            ].join(' ')}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </button>
      </div>
    </aside>
  );
}
