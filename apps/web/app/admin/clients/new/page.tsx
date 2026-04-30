import Link from 'next/link';

import { Card } from '@/components/ui';
import { listClientTags } from '@/lib/api/client-tags';

import { ClientForm } from '../ClientForm';
import { createClientAction } from '../_actions';

export default async function NewClientPage() {
  // Fetch a generous page of active tags for the picker. Tag count per
  // tenant is small (< 50 in practice); take=200 covers any realistic
  // case with a single round-trip.
  const { tags } = await listClientTags({ take: 200 });

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/clients"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to clients
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Clients</span>
        <h1 className="t-display-lg">New client</h1>
      </header>
      <Card padding="lg">
        <ClientForm
          action={createClientAction}
          tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          submitLabel="Create client"
        />
      </Card>
    </div>
  );
}
