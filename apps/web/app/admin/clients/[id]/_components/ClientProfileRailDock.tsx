import {
  MessageIcon,
  MoreIcon,
  StarIcon,
} from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

// 3-icon dock that lives at the bottom of the left-rail sidebar variant
// of the client profile menu. All three actions are Coming-soon stubs —
// More actions / Message client / Favorite client — until their backing
// features (action menu, messaging, favorites) ship in follow-up tickets.

type DockItem = {
  label: string;
  Icon: (props: { className?: string }) => JSX.Element;
};

const ITEMS: DockItem[] = [
  {
    label: 'More actions',
    Icon: (p) => <MoreIcon className={p.className} />,
  },
  {
    label: 'Message client',
    Icon: (p) => <MessageIcon className={p.className} />,
  },
  {
    label: 'Favorite client',
    Icon: (p) => <StarIcon className={p.className} />,
  },
];

export function ClientProfileRailDock() {
  return (
    <div
      role="group"
      aria-label="Client profile quick actions"
      className={cn(
        'mt-s3 flex items-center gap-s2 border-t border-line/70 pt-s3',
        'px-s2',
      )}
    >
      {ITEMS.map((item) => (
        <button
          key={item.label}
          type="button"
          aria-disabled="true"
          aria-label={item.label}
          title="Coming soon"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-sm',
            'text-ink-3 cursor-not-allowed opacity-70',
            'hover:bg-sage-tint-2',
          )}
        >
          <item.Icon className="h-[16px] w-[16px]" />
        </button>
      ))}
    </div>
  );
}
