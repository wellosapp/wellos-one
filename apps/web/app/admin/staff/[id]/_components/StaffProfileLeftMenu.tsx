'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

import {
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  GridIcon,
  ImageIcon,
  LayoutIcon,
} from '@/app/admin/_shell/icons';

import { StaffProfileRailDock } from './StaffProfileRailDock';

// Left section menu for the staff profile. Reads its own active state from
// `usePathname()` so the parent layout (a server component) doesn't need to
// thread an `activeKey` prop. Mirrors `ClientProfileLeftMenu` shape.
//
// Renders in two shapes:
//   • `sidebar`  — 260px sticky column (desktop default).
//   • `pills`    — horizontal scrollable pill row (<1080px collapse).

type MenuKey =
  | 'overview'
  | 'schedule'
  | 'services'
  | 'booking-settings'
  | 'forms'
  | 'files';

function menuKeyFromPathname(pathname: string, base: string): MenuKey {
  if (pathname.startsWith(`${base}/schedule`)) return 'schedule';
  if (pathname.startsWith(`${base}/services`)) return 'services';
  if (pathname.startsWith(`${base}/booking-settings`)) return 'booking-settings';
  if (pathname.startsWith(`${base}/forms`)) return 'forms';
  if (pathname.startsWith(`${base}/files`)) return 'files';
  return 'overview';
}

export function StaffProfileLeftMenu({
  staffId,
  variant = 'sidebar',
}: {
  staffId: string;
  variant?: 'sidebar' | 'pills';
}) {
  const pathname = usePathname();
  const base = `/admin/staff/${staffId}`;
  const active = menuKeyFromPathname(pathname, base);

  type Item = {
    key: MenuKey;
    label: string;
    href: Route;
    Icon: (props: { className?: string }) => JSX.Element;
  };

  const items: Item[] = [
    {
      key: 'overview',
      label: 'Overview',
      href: base as Route,
      Icon: (p) => <LayoutIcon className={p.className} />,
    },
    {
      key: 'schedule',
      label: 'Schedule',
      href: `${base}/schedule` as Route,
      Icon: (p) => <ClockIcon className={p.className} />,
    },
    {
      key: 'services',
      label: 'Services',
      href: `${base}/services` as Route,
      Icon: (p) => <GridIcon className={p.className} />,
    },
    {
      key: 'booking-settings',
      label: 'Booking settings',
      href: `${base}/booking-settings` as Route,
      Icon: (p) => <CalendarIcon className={p.className} />,
    },
    {
      key: 'forms',
      label: 'Forms',
      href: `${base}/forms` as Route,
      Icon: (p) => <ClipboardIcon className={p.className} />,
    },
    {
      key: 'files',
      label: 'Files',
      href: `${base}/files` as Route,
      Icon: (p) => <ImageIcon className={p.className} />,
    },
  ];

  if (variant === 'pills') {
    return (
      <nav
        aria-label="Staff profile sections"
        className={cn(
          'flex w-full items-center gap-s2 overflow-x-auto rounded-md',
          'border border-line bg-surface p-s2 shadow-sm',
        )}
      >
        {items.map((item) => {
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-s2 rounded-sm px-s3 py-s2',
                't-body-sm no-underline transition-colors duration-fast',
                isActive
                  ? 'bg-sage-tint text-sage-deep font-semibold'
                  : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
              )}
            >
              <item.Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center border-l border-line pl-s2">
          <StaffProfileRailDock />
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Staff profile sections"
      className={cn(
        'sticky top-s6 flex w-full flex-col gap-[2px]',
        'rounded-md border border-line bg-surface p-s3 shadow-sm',
      )}
    >
      <div className="px-s3 pb-s2 pt-s2 t-eyebrow text-ink-4">
        Profile sections
      </div>
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-s3 rounded-sm px-s3 py-s2',
              't-body-sm no-underline transition-colors duration-fast',
              isActive
                ? 'bg-sage-tint text-sage-deep font-semibold'
                : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
            )}
          >
            <item.Icon className="h-[17px] w-[17px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {isActive && (
              <span
                aria-hidden
                className={cn(
                  'absolute -right-s3 top-s2 bottom-s2 w-[3px]',
                  'rounded-l-sm bg-sage',
                )}
              />
            )}
          </Link>
        );
      })}
      <div className="mt-s3 border-t border-line pt-s3">
        <StaffProfileRailDock />
      </div>
    </nav>
  );
}
