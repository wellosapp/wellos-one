import Link from 'next/link';

import { Card } from '@/components/ui';
import { listServices } from '@/lib/api/services';

import { StaffForm } from '../StaffForm';
import { createStaffAction } from '../_actions';

export default async function NewStaffPage() {
  // Fetch active services so the form can render the multi-select. Take
  // a generous page so we never accidentally omit one — staff M2M caps
  // at 200 (per schema), and a tenant with >200 services has bigger
  // problems than a paginated form.
  const { services } = await listServices({ active: true, take: 200 });

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/staff"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to staff
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Staff</span>
        <h1 className="t-display-lg">New staff</h1>
      </header>
      <Card padding="lg">
        <StaffForm
          action={createStaffAction}
          services={services.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          submitLabel="Create staff"
        />
      </Card>
    </div>
  );
}
