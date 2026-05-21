'use client';

// QuickActions — six common shortcuts (new booking, add client, etc.).
// Client component so the disabled Export CSV button can render the
// 'cursor-not-allowed' affordance without server-side warnings.

import type { Route } from 'next';
import Link from 'next/link';
import {
  CalendarIcon,
  UserPlusIcon,
  SparkIcon,
  ClipboardIcon,
  MessageIcon,
  DownloadIcon,
} from '@/app/admin/_shell/icons';

type ActionItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: Route | null;
  /** If true, render as disabled button with 'Coming soon' tooltip. */
  disabled?: boolean;
};

const ACTIONS: ActionItem[] = [
  {
    id: 'book',
    label: 'New booking',
    icon: <CalendarIcon size={16} />,
    href: '/admin/calendar' as Route,
  },
  {
    id: 'client',
    label: 'Add client',
    icon: <UserPlusIcon size={16} />,
    href: '/admin/clients/new' as Route,
  },
  {
    id: 'service',
    label: 'New service',
    icon: <SparkIcon size={16} />,
    href: '/admin/services/new' as Route,
  },
  {
    id: 'intake',
    label: 'Send intake',
    icon: <ClipboardIcon size={16} />,
    href: '/admin/intake-forms' as Route,
  },
  {
    id: 'message',
    label: 'Message client',
    icon: <MessageIcon size={16} />,
    href: '/admin/clients' as Route,
  },
  {
    id: 'export',
    label: 'Export CSV',
    icon: <DownloadIcon size={16} />,
    href: null,
    disabled: true,
  },
];

const ITEM_CLASS =
  'flex items-center gap-s2 rounded-sm border border-line bg-surface-2 p-s3 text-left text-[12.5px] font-medium text-ink transition-colors duration-fast hover:border-sage-soft hover:bg-sage-tint [&_svg]:h-[16px] [&_svg]:w-[16px] [&_svg]:text-sage';

export function QuickActions() {
  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">Quick actions</h3>
        <div className="flex-1" />
        <span className="inline-flex items-center rounded-sm border border-line bg-surface-sunk px-s2 py-[2px] font-mono text-[11px] text-ink-3">
          &#8984;K
        </span>
      </header>
      <div className="grid grid-cols-2 gap-s2">
        {ACTIONS.map((action) =>
          action.disabled || action.href === null ? (
            <button
              key={action.id}
              type="button"
              disabled
              title="Coming soon"
              className={`${ITEM_CLASS} cursor-not-allowed opacity-60`}
            >
              {action.icon}
              {action.label}
            </button>
          ) : (
            <Link key={action.id} href={action.href} className={ITEM_CLASS}>
              {action.icon}
              {action.label}
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
