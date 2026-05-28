'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import type { Route } from 'next';

import { ChevronRightIcon } from './icons';
import { RailLink, type RailLinkProps } from './RailLink';

// Collapsible rail group. Two render modes:
//
// 1. Expanded rail mode (220px) — renders the group as a click-to-toggle
//    header row with chevron, and reveals the indented children when open.
//    Open state persists in localStorage; if a child route is active, the
//    group is force-open regardless of stored state.
//
// 2. Collapsed rail mode (68px icons-only) — the group itself shows as a
//    single icon row. Hovering or keyboard-focusing the row opens a flyout
//    panel anchored to the group's right edge. The flyout uses
//    `position: fixed` so it escapes the rail's overflow-y-auto scroll
//    container without a portal.
//
// Hover handoff: a small grace timer (180ms) keeps the flyout open while the
// cursor crosses the gap between the trigger and the flyout panel, so users
// can move into the flyout without it dismissing under them.

type IconComponent = ComponentType<{ size?: number; className?: string }>;

interface ChildItem {
  label: string;
  href: Route;
  icon: IconComponent;
}

export interface RailGroupProps {
  /** Stable id — localStorage key suffix + ARIA controls target. */
  id: string;
  label: string;
  Icon: IconComponent;
  /** Single-level children. Nested groups aren't supported by design. */
  items: ChildItem[];
  expanded: boolean;
  /** Open state (in expanded rail mode). */
  open: boolean;
  onToggle: () => void;
  /** Pathname-aware active predicate, supplied by AdminRail. */
  isActive: (href: string) => boolean;
}

export function RailGroup({
  id,
  label,
  Icon,
  items,
  expanded,
  open,
  onToggle,
  isActive,
}: RailGroupProps) {
  if (!expanded) {
    return (
      <CollapsedRailGroup
        id={id}
        label={label}
        Icon={Icon}
        items={items}
        isActive={isActive}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`rail-group-${id}`}
        title={label}
        className={[
          'group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm',
          'border-0 bg-transparent px-s3 py-[10px] text-left text-[13.5px] font-medium',
          'text-ink-3 transition-colors duration-fast',
          'hover:bg-sage-tint-2 hover:text-ink',
          'focus-visible:shadow-focus focus-visible:outline-none',
        ].join(' ')}
      >
        <Icon size={20} className="shrink-0 max-w-none" />
        <span className="flex-1">{label}</span>
        <ChevronRightIcon
          size={14}
          className={[
            'shrink-0 max-w-none text-ink-4 transition-transform duration-fast',
            open ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>
      {open ? (
        <div
          id={`rail-group-${id}`}
          role="group"
          aria-label={label}
          className="flex flex-col gap-s1"
        >
          {items.map((child) => (
            <RailLink
              key={child.href}
              href={child.href}
              label={child.label}
              Icon={child.icon}
              active={isActive(child.href)}
              expanded={expanded}
              nested
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

// ---- Collapsed-rail group with flyout ----

interface CollapsedRailGroupProps {
  id: string;
  label: string;
  Icon: IconComponent;
  items: ChildItem[];
  isActive: (href: string) => boolean;
}

interface FlyoutAnchor {
  top: number;
  left: number;
}

const FLYOUT_GRACE_MS = 180;

function CollapsedRailGroup({
  id,
  label,
  Icon,
  items,
  isActive,
}: CollapsedRailGroupProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [anchor, setAnchor] = useState<FlyoutAnchor | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const childActive = items.some((c) => isActive(c.href));

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openFlyout = useCallback(() => {
    clearCloseTimer();
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.top, left: r.right + 8 });
    setFlyoutOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setFlyoutOpen(false);
    }, FLYOUT_GRACE_MS);
  }, [clearCloseTimer]);

  // Cleanup any pending timer on unmount to avoid setState-after-unmount.
  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  // Dismiss the flyout if anything scrolls — the cached anchor would be wrong
  // and chasing it on every scroll tick is fussier than just closing.
  useEffect(() => {
    if (!flyoutOpen) return;
    const onScroll = () => {
      setFlyoutOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [flyoutOpen]);

  // Esc-to-close while the flyout is up — pairs with the focus model below.
  useEffect(() => {
    if (!flyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFlyoutOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyoutOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-haspopup="menu"
        aria-expanded={flyoutOpen}
        aria-controls={`rail-flyout-${id}`}
        // Hovering enters; mouseleave starts the close timer. The flyout
        // panel cancels the timer on its own hover.
        onMouseEnter={openFlyout}
        onMouseLeave={scheduleClose}
        onFocus={openFlyout}
        onBlur={scheduleClose}
        className={[
          'group relative flex items-center gap-s3 overflow-hidden whitespace-nowrap rounded-sm',
          'border-0 bg-transparent px-s3 py-[10px] text-left text-[13.5px] font-medium',
          'transition-colors duration-fast',
          'focus-visible:shadow-focus focus-visible:outline-none',
          childActive
            ? 'bg-sage-tint text-sage-deep'
            : 'text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
        ].join(' ')}
      >
        {childActive ? (
          <span
            aria-hidden="true"
            className="absolute -left-s2 top-s2 bottom-s2 w-[3px] rounded-r-sm bg-sage"
          />
        ) : null}
        <Icon size={20} className="shrink-0 max-w-none" />
        <span className="-translate-x-1 opacity-0">{label}</span>
      </button>

      {flyoutOpen && anchor ? (
        <div
          id={`rail-flyout-${id}`}
          role="menu"
          aria-label={label}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          style={{ position: 'fixed', top: anchor.top, left: anchor.left }}
          className={[
            'z-40 min-w-[200px] rounded-md border border-line bg-surface shadow-lg',
            'flex flex-col gap-s1 p-s2',
          ].join(' ')}
        >
          <div className="px-s3 py-s1 t-eyebrow text-ink-4">{label}</div>
          {items.map((child) => (
            <FlyoutLink
              key={child.href}
              href={child.href}
              label={child.label}
              Icon={child.icon}
              active={isActive(child.href)}
              onSelect={() => setFlyoutOpen(false)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

interface FlyoutLinkProps {
  href: Route;
  label: string;
  Icon: IconComponent;
  active: boolean;
  onSelect: () => void;
}

function FlyoutLink({ href, label, Icon, active, onSelect }: FlyoutLinkProps) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-s3 rounded-sm px-s3 py-s2 t-body-sm no-underline',
        'transition-colors duration-fast',
        'focus-visible:shadow-focus focus-visible:outline-none',
        active
          ? 'bg-sage-tint text-sage-deep'
          : 'text-ink hover:bg-sage-tint-2',
      ].join(' ')}
    >
      <Icon size={16} className="shrink-0 max-w-none text-ink-3" />
      <span>{label}</span>
    </Link>
  );
}

// Re-export the leaf props type so AdminRail consumers only need this file.
export type { RailLinkProps };
