'use client';

import { useEffect, useRef, useState } from 'react';

import { BellIcon } from './icons';

// Topbar notifications affordance. The notifications system itself isn't
// built yet (Epic 8 territory) — the popover renders empty-state copy so
// the button is real UI today, with a real handler and outside-click
// dismiss, and the panel content swaps in when the underlying feed exists.

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-ink-2 transition-colors duration-fast hover:border-sage-soft hover:bg-sage-tint-2 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <BellIcon size={18} />
        {/* Red dot indicator — keeps the affordance signposted until the
            feed lands. Hide once unread counts are wired and there are zero. */}
        <span
          aria-hidden="true"
          className="absolute right-[9px] top-[9px] h-[7px] w-[7px] rounded-full border-2 border-surface bg-terracotta"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-md border border-line bg-surface-2 p-s4 shadow-md"
        >
          <p className="t-eyebrow text-ink-3">Notifications</p>
          <p className="mt-s2 t-body-md text-ink-3">No new notifications.</p>
        </div>
      ) : null}
    </div>
  );
}
