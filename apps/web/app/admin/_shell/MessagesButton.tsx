'use client';

import { useEffect, useRef, useState } from 'react';

import { InboxIcon } from './icons';

// Topbar messages affordance. Same pattern as NotificationsButton — empty
// state today; the panel body swaps in when the messages surface lands.
// No dot indicator (the design only badges notifications).

export function MessagesButton() {
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
        aria-label="Messages"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-ink-2 transition-colors duration-fast hover:border-sage-soft hover:bg-sage-tint-2 focus-visible:shadow-focus focus-visible:outline-none"
      >
        <InboxIcon size={18} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-md border border-line bg-surface-2 p-s4 shadow-md"
        >
          <p className="t-eyebrow text-ink-3">Messages</p>
          <p className="mt-s2 t-body-md text-ink-3">No new messages.</p>
        </div>
      ) : null}
    </div>
  );
}
