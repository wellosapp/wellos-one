'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

// URL-driven tab nav. Each tab is a Link that flips a search param so deep
// links land on the right tab and back/forward navigates between them.
// Renders as a horizontal tab strip with an active underline.

export interface TabItem {
  key: string;
  label: ReactNode;
  // Optional badge / count chip rendered after the label.
  trailing?: ReactNode;
  // If true, the tab still renders but is greyed out and click does nothing
  // visible (the link is still a real anchor — kept for keyboard nav).
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  activeKey: string;
  // Caller produces the href for each tab key. Lets the parent preserve any
  // unrelated search params (e.g. ?date=, ?selected=).
  hrefForKey: (key: string) => string;
  className?: string;
}

export function Tabs({ items, activeKey, hrefForKey, className }: TabsProps) {
  return (
    <nav
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'flex items-center gap-s1 overflow-x-auto border-b border-surface-3',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            role="tab"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            href={hrefForKey(item.key) as Route}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-s2 px-s4 py-s3 no-underline',
              't-body-sm font-medium transition-colors duration-fast',
              active
                ? 'text-ink'
                : item.disabled
                  ? 'text-ink-soft/60 pointer-events-none'
                  : 'text-ink-soft hover:text-ink',
            )}
          >
            <span>{item.label}</span>
            {item.trailing}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-s2 -bottom-px h-[2px] rounded-sm bg-accent"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
