import { cn } from '@/lib/cn';

import {
  MessageIcon,
  MoreIcon,
  StarIcon,
} from '@/app/admin/_shell/icons';

// Three-icon dock that sits at the bottom of the sidebar-variant left menu.
// All three are visually disabled stubs — More / Message / Favorite — with a
// "Coming soon" title. Hooks land in follow-up tickets (per the plan).

export function ClientProfileRailDock() {
  const buttons = [
    { key: 'more', label: 'More actions', Icon: MoreIcon },
    { key: 'message', label: 'Message client', Icon: MessageIcon },
    { key: 'favorite', label: 'Favorite client', Icon: StarIcon },
  ];

  return (
    <div
      className={cn(
        'mt-s3 flex items-center gap-s2 border-t border-line pt-s3',
      )}
    >
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-disabled="true"
          title="Coming soon"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-sm',
            'text-ink-3 opacity-70 cursor-not-allowed',
          )}
        >
          <b.Icon size={16} />
          <span className="sr-only">{b.label}</span>
        </button>
      ))}
    </div>
  );
}
