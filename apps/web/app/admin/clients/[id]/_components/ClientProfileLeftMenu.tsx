'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

import {
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  ImageIcon,
  LayoutIcon,
  TrendUpIcon,
} from '@/app/admin/_shell/icons';

import { ClientProfileRailDock } from './ClientProfileRailDock';

// Left section menu for the client profile. Reads its own active state
// from `usePathname()` so the parent layout (a server component) doesn't
// need to thread an `activeKey` prop. Same pattern as the previous
// `ClientProfileTabs` it replaces.
//
// Renders in two shapes:
//   • `sidebar`  — 260px sticky column (desktop default).
//   • `pills`    — horizontal scrollable pill row (<1080px collapse).
// The active-item right-border accent is suppressed in `pills` mode.

type MenuKey =
  | 'overview'
  | 'visits'
  | 'book'
  | 'notes'
  | 'files'
  | 'intake'
  | 'activity';

function menuKeyFromPathname(pathname: string, base: string): MenuKey {
  if (pathname.startsWith(`${base}/timeline`)) return 'visits';
  if (pathname.startsWith(`${base}/book`)) return 'book';
  if (pathname.startsWith(`${base}/notes`)) return 'notes';
  if (pathname.startsWith(`${base}/files`)) return 'files';
  if (pathname.startsWith(`${base}/intake`)) return 'intake';
  if (pathname.startsWith(`${base}/activity`)) return 'activity';
  return 'overview';
}

export function ClientProfileLeftMenu({
  clientId,
  visitTotal,
  variant = 'sidebar',
}: {
  clientId: string;
  visitTotal: number;
  variant?: 'sidebar' | 'pills';
}) {
  const pathname = usePathname();
  const base = `/admin/clients/${clientId}`;
  const active = menuKeyFromPathname(pathname, base);

  type Item = {
    key: MenuKey;
    label: string;
    href: Route;
    Icon: (props: { className?: string }) => JSX.Element;
    count?: number;
    disabled?: boolean;
    disabledHint?: string;
  };

  const items: Item[] = [
    {
      key: 'overview',
      label: 'Overview',
      href: base as Route,
      Icon: (p) => <LayoutIcon className={p.className} />,
    },
    {
      key: 'visits',
      label: 'Visits',
      href: `${base}/timeline` as Route,
      Icon: (p) => <ClockIcon className={p.className} />,
      count: visitTotal > 0 ? visitTotal : undefined,
    },
    {
      key: 'book',
      label: 'Book',
      href: `${base}/book` as Route,
      Icon: (p) => <CalendarIcon className={p.className} />,
    },
    {
      key: 'notes',
      label: 'Notes',
      href: `${base}/notes` as Route,
      Icon: (p) => <ClipboardIcon className={p.className} />,
    },
    {
      key: 'files',
      label: 'Files',
      href: `${base}/files` as Route,
      Icon: (p) => <ImageIcon className={p.className} />,
    },
    {
      key: 'intake',
      label: 'Intake',
      href: `${base}/intake` as Route,
      Icon: (p) => <ClipboardIcon className={p.className} />,
    },
    {
      key: 'activity',
      label: 'Activity',
      href: `${base}/activity` as Route,
      Icon: (p) => <TrendUpIcon className={p.className} />,
      disabled: true,
      disabledHint: 'Coming soon — audit feed lands in a follow-up.',
    },
  ];

  if (variant === 'pills') {
    return (
      <nav
        aria-label="Client profile sections"
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
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.disabledHint : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-s2 rounded-sm px-s3 py-s2',
                't-body-sm no-underline transition-colors duration-fast',
                isActive
                  ? 'bg-sage-tint text-sage-deep font-semibold'
                  : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
                item.disabled && 'opacity-60',
              )}
            >
              <item.Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.count != null && (
                <span
                  className={cn(
                    'ml-s1 inline-flex min-w-[22px] items-center justify-center',
                    'rounded-full px-s2 t-caption tabular-nums',
                    isActive
                      ? 'bg-sage text-ink-inv'
                      : 'bg-surface-sunk text-ink-3',
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Client profile sections"
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
            aria-disabled={item.disabled || undefined}
            title={item.disabled ? item.disabledHint : undefined}
            className={cn(
              'relative flex items-center gap-s3 rounded-sm px-s3 py-s2',
              't-body-sm no-underline transition-colors duration-fast',
              isActive
                ? 'bg-sage-tint text-sage-deep font-semibold'
                : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
              item.disabled && 'opacity-60',
            )}
          >
            <item.Icon className="h-[17px] w-[17px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.count != null && (
              <span
                className={cn(
                  'inline-flex min-w-[22px] items-center justify-center',
                  'rounded-full px-s2 t-caption tabular-nums',
                  isActive
                    ? 'bg-sage text-ink-inv'
                    : 'bg-surface-sunk text-ink-3',
                )}
              >
                {item.count}
              </span>
            )}
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
      <ClientProfileRailDock />
    </nav>
  );
}
