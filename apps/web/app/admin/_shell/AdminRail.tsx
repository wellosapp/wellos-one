'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import type { Route } from 'next';

import {
  ActivityIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
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
  UsersIcon,
} from './icons';

// Matches the IconProps shape exported by ./icons. We only ever pass
// `size`, so this loose contract is intentional — anything else (className,
// aria-*, etc.) flows through the underlying <svg>.
type IconComponent = ComponentType<{ size?: number; className?: string }>;

// ---- Data shape ----
//
// Entries inside a group can be either a leaf (a routed link) or a parent
// (a collapsible header with leaf children one level deep). One level of
// nesting is intentional — deeper nests blow past the rail's design and
// invite "where the hell is X" navigation fatigue.

interface RailLeaf {
  type: 'leaf';
  label: string;
  href: Route;
  icon: IconComponent;
}

interface RailParent {
  type: 'parent';
  /** Stable id used as the localStorage key suffix. */
  id: string;
  label: string;
  icon: IconComponent;
  children: RailLeaf[];
}

type RailEntry = RailLeaf | RailParent;

interface RailGroup {
  label: string;
  entries: RailEntry[];
}

function leaf(label: string, href: Route, icon: IconComponent): RailLeaf {
  return { type: 'leaf', label, href, icon };
}
function parent(
  id: string,
  label: string,
  icon: IconComponent,
  children: RailLeaf[],
): RailParent {
  return { type: 'parent', id, label, icon, children };
}

// Order mirrors the design's RAIL_GROUPS, mapped to existing routes on
// main. Routes that exist on feature branches but not yet on main re-
// appear when those branches merge. The super-admin-only /admin/impersonate
// route stays accessible via direct URL + the ImpersonationBanner.
const RAIL_GROUPS: RailGroup[] = [
  {
    label: 'Workspace',
    entries: [
      leaf('Overview', '/admin' as Route, LayoutIcon),
      leaf('Calendar', '/admin/calendar' as Route, CalendarIcon),
    ],
  },
  {
    label: 'People',
    entries: [
      leaf('Clients', '/admin/clients' as Route, UsersIcon),
      leaf('Staff', '/admin/staff' as Route, StaffIcon),
      leaf('Waitlist', '/admin/waitlist' as Route, HourglassIcon),
    ],
  },
  {
    label: 'Catalog',
    entries: [
      parent('booking', 'Booking', GridIcon, [
        leaf('Services', '/admin/services' as Route, SparkIcon),
        leaf('Classes', '/admin/classes' as Route, SparkIcon),
        leaf('Categories', '/admin/service-categories' as Route, GridIcon),
        leaf('Tags', '/admin/client-tags' as Route, TagIcon),
      ]),
      leaf('Automations', '/admin/automations' as Route, ActivityIcon),
      parent('forms', 'Forms', ClipboardIcon, [
        leaf('Intake forms', '/admin/intake-forms' as Route, ClipboardIcon),
        leaf(
          'Staff onboarding',
          '/admin/staff-onboarding-forms' as Route,
          ClipboardIcon,
        ),
      ]),
      leaf('Media', '/admin/media' as Route, ImageIcon),
    ],
  },
  {
    label: 'Operations',
    entries: [
      leaf(
        'Review queue',
        '/admin/forms/review-queue' as Route,
        ClipboardCheckIcon,
      ),
      leaf(
        'Automation runs',
        '/admin/automations/runs' as Route,
        ActivityIcon,
      ),
      leaf(
        'Check-in audit',
        '/admin/class-check-in-attempts' as Route,
        ShieldIcon,
      ),
    ],
  },
];

// `/admin` only matches the exact root; everything else matches by prefix
// so e.g. `/admin/clients/abc/notes` activates the Clients item.
//
// `/admin/automations` is special-cased so it does NOT swallow
// `/admin/automations/runs` (a sibling rail entry in the Operations group).
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

function parentHasActiveChild(p: RailParent, pathname: string): boolean {
  return p.children.some((c) => isActive(c.href, pathname));
}

// localStorage key prefix for per-parent open state. Each parent's id is
// appended (e.g. `wellos:admin-rail-group:booking`). Default state for any
// parent is OPEN — users see all options on first visit.
const PARENT_STORAGE_PREFIX = 'wellos:admin-rail-group:';

function readStoredParentOpen(id: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(`${PARENT_STORAGE_PREFIX}${id}`);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredParentOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(
      `${PARENT_STORAGE_PREFIX}${id}`,
      String(open),
    );
  } catch {
    // Storage unavailable (privacy mode) — feature degrades silently.
  }
}

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

  // Per-parent open state. SSR + first client paint use the default (open);
  // a follow-up effect rehydrates from localStorage. Avoids a hydration
  // mismatch by not reading storage during render.
  const allParentIds = useAllParentIds();
  const [openByParentId, setOpenByParentId] = useState<Record<string, boolean>>(
    () => Object.fromEntries(allParentIds.map((id) => [id, true])),
  );
  useEffect(() => {
    setOpenByParentId((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const id of allParentIds) {
        const stored = readStoredParentOpen(id);
        if (stored !== null) next[id] = stored;
      }
      return next;
    });
  }, [allParentIds]);

  const toggleParent = useCallback((id: string) => {
    setOpenByParentId((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeStoredParentOpen(id, next[id] ?? true);
      return next;
    });
  }, []);

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
            className={`h-8 shrink-0 object-contain transition-[width,max-width] duration-base ${
              expanded ? 'w-auto max-w-[140px]' : 'w-8 max-w-8'
            }`}
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
              className={`font-display text-[22px] leading-none tracking-[-0.01em] transition-[opacity,transform] duration-base ${
                expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0'
              }`}
            >
              Wellos
            </span>
          </>
        )}
      </Link>

      {/*
        Middle scroll region. Even with collapsible parents, the absolute
        worst case (every parent expanded on a very short viewport) can
        still overflow — keep overflow-y-auto as a safety net. min-h-0 is
        the magic flex sauce that lets the scroll engage at all.
      */}
      <nav className="flex min-h-0 flex-1 flex-col gap-s1 overflow-y-auto">
        {RAIL_GROUPS.map((group) => (
          <div key={group.label} className="flex shrink-0 flex-col gap-s1">
            <RailSectionLabel expanded={expanded}>{group.label}</RailSectionLabel>
            {group.entries.map((entry) => {
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
              const childActive = parentHasActiveChild(entry, pathname);
              const userOpen = openByParentId[entry.id] ?? true;
              // Force-open while a child is the active route — otherwise
              // the user gets a "where am I" gap when navigating to a
              // nested page after collapsing its parent.
              const open = childActive ? true : userOpen;
              return (
                <RailParentBlock
                  key={entry.id}
                  parent={entry}
                  open={open}
                  onToggle={() => toggleParent(entry.id)}
                  expanded={expanded}
                  pathname={pathname}
                />
              );
            })}
          </div>
        ))}
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
            className={`whitespace-nowrap transition-[opacity,transform] duration-base ${
              expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0'
            }`}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </button>
      </div>
    </aside>
  );
}

// Stable-identity list of parent ids. Computed from the static catalog so
// the effect dependency doesn't refire across renders.
function useAllParentIds(): readonly string[] {
  // RAIL_GROUPS is module-scope and never mutates — safe to compute once.
  // Wrap in a hook so React's exhaustive-deps lint stays happy without
  // sprinkling eslint-disable comments at the call site.
  return ALL_PARENT_IDS;
}

const ALL_PARENT_IDS: readonly string[] = RAIL_GROUPS.flatMap((g) =>
  g.entries.filter((e): e is RailParent => e.type === 'parent').map((p) => p.id),
);

function RailSectionLabel({
  children,
  expanded,
}: {
  children: React.ReactNode;
  expanded: boolean;
}) {
  // Collapsed: render a thin separator dash centered in the gap. Expanded:
  // render the eyebrow.
  if (!expanded) {
    return (
      <div className="flex h-[14px] items-center justify-center pb-s1 pt-s2">
        <span aria-hidden="true" className="block h-[1px] w-4 bg-line-strong" />
      </div>
    );
  }
  return (
    <div className="flex h-[26px] items-center px-s3 pb-s1 pt-s3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-4">
      {children}
    </div>
  );
}

interface RailLinkProps {
  href: Route;
  label: string;
  Icon: IconComponent;
  active: boolean;
  expanded: boolean;
  /** Nested children render with a slight indent in expanded mode. */
  nested?: boolean;
}

function RailLink({ href, label, Icon, active, expanded, nested }: RailLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm py-[10px] text-[13.5px] font-medium no-underline transition-colors duration-fast focus-visible:shadow-focus focus-visible:outline-none ${
        // Nested leaves indent slightly when the rail is expanded; in the
        // collapsed icon-only mode we re-align to the full-width pad.
        nested && expanded ? 'pl-s6 pr-s3' : 'px-s3'
      } ${
        active
          ? 'bg-sage-tint text-sage-deep'
          : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink'
      }`}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -left-s2 top-s2 bottom-s2 w-[3px] rounded-r-sm bg-sage"
        />
      ) : null}
      {/* shrink-0 + max-w-none override Tailwind preflight's `max-width: 100%`
          on svg — without them, flex shrinking + a narrow 28px collapsed-rail
          inner width collapsed the icon to roughly nothing. */}
      <Icon size={20} className="shrink-0 max-w-none" />
      <span
        className={`transition-[opacity,transform] duration-base ${
          expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0'
        }`}
      >
        {label}
      </span>
      {/* Tooltip — collapsed-rail only, on hover/focus. */}
      {!expanded ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-sm bg-ink px-s2 py-[5px] text-[12px] text-ink-inv opacity-0 shadow-md transition-[opacity,transform] duration-fast group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
          {label}
        </span>
      ) : null}
    </Link>
  );
}

interface RailParentBlockProps {
  parent: RailParent;
  open: boolean;
  onToggle: () => void;
  expanded: boolean;
  pathname: string;
}

function RailParentBlock({
  parent,
  open,
  onToggle,
  expanded,
  pathname,
}: RailParentBlockProps) {
  const Icon = parent.icon;

  // Collapsed rail (68px icons-only): the parent itself isn't a link, so
  // we render each leaf child as its own row instead of the parent. The
  // hierarchy is purely a feature of expanded mode.
  if (!expanded) {
    return (
      <>
        {parent.children.map((child) => (
          <RailLink
            key={child.href}
            href={child.href}
            label={child.label}
            Icon={child.icon}
            active={isActive(child.href, pathname)}
            expanded={expanded}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`rail-parent-${parent.id}`}
        title={parent.label}
        className="group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm border-0 bg-transparent px-s3 py-[10px] text-left text-[13.5px] font-medium text-ink-3 transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink focus-visible:shadow-focus focus-visible:outline-none"
      >
        <Icon size={20} className="shrink-0 max-w-none" />
        <span className="flex-1">{parent.label}</span>
        <ChevronRightIcon
          size={14}
          className={`shrink-0 max-w-none text-ink-4 transition-transform duration-fast ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>
      {open ? (
        <div id={`rail-parent-${parent.id}`} className="flex flex-col gap-s1">
          {parent.children.map((child) => (
            <RailLink
              key={child.href}
              href={child.href}
              label={child.label}
              Icon={child.icon}
              active={isActive(child.href, pathname)}
              expanded={expanded}
              nested
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
