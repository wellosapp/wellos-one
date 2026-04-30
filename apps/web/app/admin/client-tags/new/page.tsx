import Link from 'next/link';

import { Card } from '@/components/ui';

import { ClientTagForm } from '../ClientTagForm';
import { createClientTagAction } from '../_actions';

export default function NewClientTagPage() {
  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/client-tags"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to tags
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Tags</span>
        <h1 className="t-display-lg">New client tag</h1>
      </header>
      <Card padding="lg">
        <ClientTagForm action={createClientTagAction} submitLabel="Create tag" />
      </Card>
    </div>
  );
}
