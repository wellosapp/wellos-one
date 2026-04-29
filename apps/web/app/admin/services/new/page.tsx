import Link from 'next/link';

import { Card } from '@/components/ui';

import { ServiceForm } from '../ServiceForm';
import { createServiceAction } from '../_actions';

export default function NewServicePage() {
  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/services"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to services
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Services</span>
        <h1 className="t-display-lg">New service</h1>
      </header>
      <Card padding="lg">
        <ServiceForm action={createServiceAction} submitLabel="Create service" />
      </Card>
    </div>
  );
}
