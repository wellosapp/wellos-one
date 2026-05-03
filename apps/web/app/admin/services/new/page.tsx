import Link from 'next/link';

import { Card } from '@/components/ui';
import { listServiceCategories } from '@/lib/api/service-categories';
import { listStaff } from '@/lib/api/staff';

import { ServiceForm } from '../ServiceForm';
import { createServiceAction } from '../_actions';

export default async function NewServicePage() {
  // Fetch active staff so the form can render the multi-select. Take a
  // generous page so we never accidentally omit one — Service.staffIds
  // caps at 200, and a tenant with >200 staff has bigger problems than
  // a paginated form.
  const [staffResp, categoriesResp] = await Promise.all([
    listStaff({ active: true, take: 200 }),
    listServiceCategories({ take: 200 }),
  ]);
  const { staff } = staffResp;
  const { categories } = categoriesResp;

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
        <ServiceForm
          action={createServiceAction}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          staff={staff.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            jobTitle: s.jobTitle,
          }))}
          submitLabel="Create service"
        />
      </Card>
    </div>
  );
}
