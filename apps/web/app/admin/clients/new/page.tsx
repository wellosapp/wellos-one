import Link from 'next/link';

import { Card } from '@/components/ui';

import { ClientForm } from '../ClientForm';
import { createClientAction } from '../_actions';

export default function NewClientPage() {
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
        <ClientForm action={createClientAction} submitLabel="Create client" />
      </Card>
    </div>
  );
}
