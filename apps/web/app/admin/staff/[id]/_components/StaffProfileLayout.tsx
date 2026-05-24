import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { StaffProfileLeftMenu } from './StaffProfileLeftMenu';

// Two-column grid orchestrator for the staff profile body. Mirrors
// `ClientProfileLayout`. At ≥1080px (Tailwind `xl:`): 260px sticky left menu
// next to a flex-1 content column. Below 1080px: horizontal pills above the
// content (the `pills` variant of the same menu).

export function StaffProfileLayout({
  staffId,
  children,
}: {
  staffId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-s4">
      {/* <1080px: horizontal pills above content */}
      <div className="xl:hidden">
        <StaffProfileLeftMenu staffId={staffId} variant="pills" />
      </div>

      <div
        className={cn(
          'flex flex-col gap-s6',
          'xl:grid xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-s8',
        )}
      >
        <aside className="hidden xl:block">
          <StaffProfileLeftMenu staffId={staffId} variant="sidebar" />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
