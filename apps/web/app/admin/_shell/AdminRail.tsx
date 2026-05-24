'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import type { Route } from 'next';

import {
  CalendarIcon,
  ClipboardIcon,
  FileTextIcon,
  GridIcon,
  HourglassIcon,
  ImageIcon,
  LayoutIcon,
  LeafIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  SparkIcon,
  StaffIcon,
  TagIcon,
  UsersIcon,
} from './icons';

// Matches the IconProps shape exported by ./icons. We only ever pass
// `size`, so this loose contract is intentional — anything else (className,
// aria-*, etc.) flows through the underlying <svg>.
type IconComponent = ComponentType<{ size?: number; className?: string }>;

interface RailItem {
  label: string;
  href: Route;
  icon: IconComponent;
}

interface RailGroup {
  label: string;
  items: RailItem[];
}

// Order mirrors the design's RAIL_GROUPS, mapped to existing routes on
// main. Routes that exist on feature branches but not yet on main
// (appointment-series, disputed-matches) re-appear when those branches
// merge — add an entry then. The super-admin-only /admin/impersonate
// route stays accessible via direct URL + the ImpersonationBanner.
const RAIL_GROUPS: RailGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', href: '/admin' as Route, icon: LayoutIcon },
      { label: 'Calendar', href: '/admin/calendar' as Route, icon: CalendarIcon },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Clients', href: '/admin/clients' as Route, icon: UsersIcon },
      { label: 'Staff', href: '/admin/staff' as Route, icon: StaffIcon },
      { label: 'Waitlist', href: '/admin/waitlist' as Route, icon: HourglassIcon },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Services', href: '/admin/services' as Route, icon: SparkIcon },
      { label: 'Classes', href: '/admin/classes' as Route, icon: SparkIcon },
      { label: 'Categories', href: '/admin/service-categories' as Route, icon: GridIcon },
      { label: 'Tags', href: '/admin/client-tags' as Route, icon: TagIcon },
      { label: 'Intake forms', href: '/admin/intake-forms' as Route, icon: ClipboardIcon },
      {
        label: 'Staff onboarding forms',
        href: '/admin/staff-onboarding-forms' as Route,
        icon: FileTextIcon,
      },
      { label: 'Media', href: '/admin/media' as Route, icon: ImageIcon },
    ],
  },
];

// `/admin` only matches the exact root; everything else matches by prefix
// so e.g. `/admin/clients/abc/notes` activates the Clients item.
function isActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/admin') return pathname === '/admin';
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
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

  return (
    <aside
      aria-label="Admin navigation"
      className="sticky top-0 z-10 flex h-screen flex-col gap-s1 border-r border-line bg-surface px-s2 py-s4"
    >
      <Link
        href={'/admin' as Route}
        aria-label="Wellos admin home"
        className="flex items-center gap-s3 overflow-hidden whitespace-nowrap px-s2 pb-s4 pt-s1 text-ink no-underline focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
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

      <nav className="flex flex-1 flex-col gap-s1">
        {RAIL_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-s1">
            <RailSectionLabel expanded={expanded}>{group.label}</RailSectionLabel>
            {group.items.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <RailLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  Icon={item.icon}
                  active={active}
                  expanded={expanded}
                />
              );
            })}
          </div>
        ))}

        <div className="flex-1" />

        <div className="flex flex-col gap-s1 border-t border-line pt-s3">
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
      </nav>
    </aside>
  );
}

function RailSectionLabel({
  children,
  expanded,
}: {
  children: React.ReactNode;
  expanded: boolean;
}) {
  // Collapsed: render a thin separator dash centered in the gap (matches the
  // design's `.rail-section::after` mini-rule). Expanded: render the eyebrow.
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
}

function RailLink({ href, label, Icon, active, expanded }: RailLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm px-s3 py-[10px] text-[13.5px] font-medium no-underline transition-colors duration-fast focus-visible:shadow-focus focus-visible:outline-none ${
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
          inner width collapsed the icon to roughly nothing and it disappeared. */}
      <Icon size={20} className="shrink-0 max-w-none" />
      <span
        className={`transition-[opacity,transform] duration-base ${
          expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0'
        }`}
      >
        {label}
      </span>
      {/* Tooltip — shows only when the rail is collapsed AND the link is hovered. */}
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
