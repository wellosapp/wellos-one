import Link from 'next/link';
import type { Route } from 'next';

import { Card } from '@/components/ui';
import { listServiceCategories } from '@/lib/api/service-categories';
import { listStaff } from '@/lib/api/staff';
// ServiceColorPicker presets + brand-color loader are reused directly from
// services/. Don't port — both are tenant-agnostic and live under services/.
import { loadTenantBrandColors } from '@/app/admin/services/_constants/loadTenantBrandColors';

import { ClassForm } from '../ClassForm';
import { createClassAction } from '../_actions';

export default async function NewClassPage() {
  const [staffResp, categoriesResp, brandColors] = await Promise.all([
    listStaff({ active: true, take: 200 }),
    listServiceCategories({ take: 200 }),
    loadTenantBrandColors(),
  ]);
  const { staff } = staffResp;
  const { categories } = categoriesResp;

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href={'/admin/classes' as Route}
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to classes
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Classes</span>
        <h1 className="t-display-lg">New class</h1>
      </header>
      <Card padding="lg">
        <ClassForm
          action={createClassAction}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          staff={staff.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            jobTitle: s.jobTitle,
          }))}
          presets={brandColors}
          submitLabel="Create class"
        />
      </Card>
    </div>
  );
}
