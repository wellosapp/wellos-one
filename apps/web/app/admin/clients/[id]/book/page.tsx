import { cn } from '@/lib/cn';

import { loadClientDetail, loadQuickBookCatalog } from '../_data';
import { BookTabClient } from './BookTabClient';

export default async function ClientBookTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await loadClientDetail(id);
  const { directory, directoryError } = await loadQuickBookCatalog();

  const summary = {
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
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <div className="t-eyebrow text-sage">Book</div>
        <h2 className="mt-s2 font-display text-[26px] text-ink">
          Schedule an appointment.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          Same booking flow as Quick Book — optimized layout for the
          dedicated Book section.
        </p>
      </header>
      <div className="p-s6 lg:p-s8">
        <BookTabClient
          summary={summary}
          directory={directory}
          directoryError={directoryError}
        />
      </div>
    </section>
  );
}
