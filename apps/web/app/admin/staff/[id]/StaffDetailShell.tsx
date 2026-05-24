'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { StaffWithServices } from '@/lib/api/staff';

import { StaffProfileHero } from './_components/StaffProfileHero';
import { StaffProfileLayout } from './_components/StaffProfileLayout';

export function StaffDetailShell({
  staff,
  children,
}: {
  staff: StaffWithServices;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/staff"
          className={cn(
            'inline-flex items-center gap-s2 rounded-sm px-s2 py-s1',
            't-body-sm font-medium text-sage-deep no-underline',
            'transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink',
          )}
        >
          <span aria-hidden>←</span>
          Staff
        </Link>
      </div>

      <StaffProfileHero staff={staff} />

      <StaffProfileLayout staffId={staff.id}>{children}</StaffProfileLayout>
    </div>
  );
}
