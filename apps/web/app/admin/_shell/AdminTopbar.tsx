import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import type { Route } from 'next';

import { MessagesButton } from './MessagesButton';
import { NotificationsButton } from './NotificationsButton';
import { PlusIcon, SearchIcon } from './icons';

interface AdminTopbarProps {
  firstName: string | null;
  /** Server-resolved hour 0-23 in the request's TZ. Drives the greeting. */
  serverHour: number;
  /** Server-rendered "Wednesday · May 20" style eyebrow. */
  todayLabel: string;
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AdminTopbar({ firstName, serverHour, todayLabel }: AdminTopbarProps) {
  const greeting = greetingFor(serverHour);
  const displayName = firstName?.trim() || 'there';

  return (
    <header className="flex items-center gap-s4 pb-s1">
      <div className="flex min-w-0 flex-col gap-s1">
        <div className="t-eyebrow flex items-center gap-s2 text-sage">
          <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-sage" />
          <span>{todayLabel}</span>
        </div>
        <h1 className="t-display-xl text-ink">
          {greeting},{' '}
          <em className="font-normal italic text-sage-deep">{displayName}</em>.
        </h1>
      </div>

      <div className="flex-1" />

      {/* Search — submit routes to /admin/clients?q=… (existing search). */}
      <form
        action="/admin/clients"
        method="GET"
        role="search"
        className="hidden h-10 w-80 items-center gap-s2 rounded-md border border-line bg-surface px-s3 text-ink-3 transition-colors duration-fast focus-within:border-sage focus-within:bg-surface-2 md:flex"
      >
        <SearchIcon size={16} aria-hidden="true" className="opacity-70" />
        <input
          type="search"
          name="q"
          placeholder="Search clients, bookings, services…"
          aria-label="Search"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-ink-4"
        />
        <kbd className="hidden rounded-sm border border-line bg-surface-sunk px-s2 py-[2px] font-mono text-[11px] text-ink-3 lg:inline-block">
          ⌘K
        </kbd>
      </form>

      <NotificationsButton />
      <MessagesButton />

      <Link
        href={'/admin/calendar' as Route}
        className="inline-flex h-10 items-center gap-s2 whitespace-nowrap rounded-md bg-sage-deep px-s4 text-[13px] font-semibold text-ink-inv transition-colors duration-fast hover:bg-ink focus-visible:shadow-focus focus-visible:outline-none"
      >
        <PlusIcon size={16} aria-hidden="true" />
        New booking
      </Link>

      <div className="grid h-10 w-10 place-items-center">
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
