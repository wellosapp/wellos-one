import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { ClientProfileLeftMenu } from './ClientProfileLeftMenu';

// Two-column grid orchestrator for the client profile body.
//
// At ≥1080px (Tailwind `xl:`): renders a 260px sticky left menu next to a
// flex-1 content column.
// Below 1080px: renders a horizontal scrollable pill row above the content
// (the `pills` variant of the same menu).
//
// `activeKey` is intentionally NOT a prop — the menu derives its own active
// state from `usePathname()`. See `ClientProfileLeftMenu.tsx`. Keeping the
// layout free of pathname access lets it stay a server component.

export function ClientProfileLayout({
  clientId,
  visitTotal,
  children,
}: {
  clientId: string;
  visitTotal: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-s4">
      {/* <1080px: horizontal pills above content */}
      <div className="xl:hidden">
        <ClientProfileLeftMenu
          clientId={clientId}
          visitTotal={visitTotal}
          variant="pills"
        />
      </div>

      <div
        className={cn(
          'flex flex-col gap-s6',
          'xl:grid xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-s8',
        )}
      >
        <aside className="hidden xl:block">
          <ClientProfileLeftMenu
            clientId={clientId}
            visitTotal={visitTotal}
            variant="sidebar"
          />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
