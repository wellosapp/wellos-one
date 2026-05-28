'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import type { Route } from 'next';

// Single rail leaf — a routed icon + label row with active-state highlight,
// optional nested indent, and a tooltip that appears on hover/focus when the
// rail is collapsed.
//
// Active state: a vertical sage bar slips in from the left edge + a tinted
// background. `aria-current="page"` surfaces it to assistive tech.
//
// Tooltip accessibility: the tooltip element responds to both :hover AND
// :focus-visible on the link, so keyboard navigation through the collapsed
// rail surfaces labels without needing a mouse.

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export interface RailLinkProps {
  href: Route;
  label: string;
  Icon: IconComponent;
  active: boolean;
  expanded: boolean;
  /**
   * True when this leaf sits one level deeper than the top of the nav (i.e.
   * a child of a collapsible group). Adds a small left indent in expanded
   * mode; collapsed mode aligns it with top-level leaves so the icon column
   * stays a single straight line.
   */
  nested?: boolean;
}

export function RailLink({
  href,
  label,
  Icon,
  active,
  expanded,
  nested,
}: RailLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={[
        'group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm py-[10px]',
        'text-[13.5px] font-medium no-underline',
        'transition-colors duration-fast',
        'focus-visible:shadow-focus focus-visible:outline-none',
        nested && expanded ? 'pl-s6 pr-s3' : 'px-s3',
        active
          ? 'bg-sage-tint text-sage-deep'
          : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
      ].join(' ')}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute -left-s2 top-s2 bottom-s2 w-[3px] rounded-r-sm bg-sage"
        />
      ) : null}
      {/* shrink-0 + max-w-none override Tailwind preflight's `max-width: 100%`
          on svg. Without them, a narrow 28px collapsed-rail inner width
          collapses the icon to roughly nothing. */}
      <Icon size={20} className="shrink-0 max-w-none" />
      <span
        className={[
          'transition-[opacity,transform] duration-base',
          expanded ? 'opacity-100 translate-x-0' : '-translate-x-1 opacity-0',
        ].join(' ')}
      >
        {label}
      </span>
      {/* Collapsed-rail tooltip — keyboard + mouse accessible. */}
      {!expanded ? (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20',
            '-translate-y-1/2 -translate-x-1',
            'whitespace-nowrap rounded-sm bg-ink px-s2 py-[5px]',
            'text-[12px] text-ink-inv shadow-md',
            'opacity-0 transition-[opacity,transform] duration-fast',
            'group-hover:translate-x-0 group-hover:opacity-100',
            'group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
          ].join(' ')}
        >
          {label}
        </span>
      ) : null}
    </Link>
  );
}
