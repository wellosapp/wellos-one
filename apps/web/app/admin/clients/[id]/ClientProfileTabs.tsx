'use client';

import type { Route } from 'next';
import { usePathname } from 'next/navigation';

import { Badge, Tabs, type TabItem } from '@/components/ui';
import { cn } from '@/lib/cn';

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VisitsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 8v4l3 2M12 22a10 10 0 110-20 10 10 0 010 20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 3v3M17 3v3M4 10h16M6 7h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2zM9 14h4M9 18h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PulseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 12h3l2-6 4 12 3-6h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function tabIcon(className?: string) {
  return cn('h-4 w-4 shrink-0 opacity-80', className);
}

function profileTabKey(pathname: string, base: string): string {
  if (pathname.startsWith(`${base}/timeline`)) return 'visits';
  if (pathname.startsWith(`${base}/book`)) return 'book';
  if (pathname.startsWith(`${base}/notes`)) return 'notes';
  if (pathname.startsWith(`${base}/files`)) return 'files';
  if (pathname.startsWith(`${base}/intake`)) return 'intake';
  if (pathname.startsWith(`${base}/activity`)) return 'activity';
  if (pathname === base || pathname === `${base}/`) return 'overview';
  return 'overview';
}

export function ClientProfileTabs({
  clientId,
  visitTotal,
  className,
}: {
  clientId: string;
  visitTotal: number;
  className?: string;
}) {
  const pathname = usePathname();
  const base = `/admin/clients/${clientId}`;
  const activeKey = profileTabKey(pathname, base);

  const items: TabItem[] = [
    {
      key: 'overview',
      label: (
        <span className="inline-flex items-center gap-s2">
          <OverviewIcon className={tabIcon()} />
          Overview
        </span>
      ),
    },
    {
      key: 'visits',
      label: (
        <span className="inline-flex items-center gap-s2">
          <VisitsIcon className={tabIcon()} />
          Visits
        </span>
      ),
      trailing:
        visitTotal > 0 ? (
          <Badge tone="neutral" className="tabular-nums">
            {visitTotal}
          </Badge>
        ) : null,
    },
    {
      key: 'book',
      label: (
        <span className="inline-flex items-center gap-s2">
          <BookIcon className={tabIcon()} />
          Book
        </span>
      ),
    },
    {
      key: 'notes',
      label: (
        <span className="inline-flex items-center gap-s2">
          <DocIcon className={tabIcon()} />
          Notes
        </span>
      ),
    },
    {
      key: 'files',
      label: (
        <span className="inline-flex items-center gap-s2">
          <FolderIcon className={tabIcon()} />
          Files
        </span>
      ),
    },
    {
      key: 'intake',
      label: (
        <span className="inline-flex items-center gap-s2">
          <ClipboardIcon className={tabIcon()} />
          Intake
        </span>
      ),
    },
    {
      key: 'activity',
      label: (
        <span className="inline-flex items-center gap-s2">
          <PulseIcon className={tabIcon()} />
          Activity
        </span>
      ),
    },
  ];

  const hrefForKey = (key: string): Route => {
    const routes: Record<string, string> = {
      overview: base,
      visits: `${base}/timeline`,
      book: `${base}/book`,
      notes: `${base}/notes`,
      files: `${base}/files`,
      intake: `${base}/intake`,
      activity: `${base}/activity`,
    };
    return (routes[key] ?? base) as Route;
  };

  return (
    <Tabs
      items={items}
      activeKey={activeKey}
      hrefForKey={hrefForKey}
      className={cn(className)}
    />
  );
}
