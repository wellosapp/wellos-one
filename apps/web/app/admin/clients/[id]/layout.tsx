import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getClientTimeline } from '@/lib/api/timeline';

import { ClientDetailShell } from './ClientDetailShell';
import { loadClientDetail, loadQuickBookCatalog } from './_data';

export default async function ClientDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client;
  try {
    client = await loadClientDetail(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const { directory: quickBookDirectory, directoryError: quickBookDirectoryError } =
    await loadQuickBookCatalog();

  let visitTotal = 0;
  try {
    const timelineHead = await getClientTimeline(id, { take: 1, skip: 0 });
    visitTotal = timelineHead.total;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  const quickBookSummary = {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    banned: client.banned,
    deletedAt: client.deletedAt,
    tags: client.tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
  };

  return (
    <ClientDetailShell
      summary={quickBookSummary}
      hero={{
        email: client.email,
        phone: client.phone,
        createdAt: client.createdAt,
      }}
      quickBookDirectory={quickBookDirectory}
      quickBookDirectoryError={quickBookDirectoryError}
      visitTotal={visitTotal}
    >
      {children}
    </ClientDetailShell>
  );
}
