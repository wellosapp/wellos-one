import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';

import { StaffDetailShell } from './StaffDetailShell';
import { loadStaffDetail } from './_components/_data';

export default async function StaffDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let staff;
  try {
    staff = await loadStaffDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return <StaffDetailShell staff={staff}>{children}</StaffDetailShell>;
}
