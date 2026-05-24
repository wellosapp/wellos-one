import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listServiceCategories } from '@/lib/api/service-categories';
import { getClass, type ClassWithInstructors } from '@/lib/api/classes';
import { listStaff } from '@/lib/api/staff';
// Reused directly from services/ per Phase 1 spec.
import { loadTenantBrandColors } from '@/app/admin/services/_constants/loadTenantBrandColors';

import { ClassForm } from '../ClassForm';
import type { ClassFormValues } from '../_actions';
import { deleteClassAction, updateClassAction } from '../_actions';

function classToFormDefaults(c: ClassWithInstructors): ClassFormValues {
  return {
    name: c.name,
    shortDescription: c.shortDescription ?? undefined,
    longDescription: c.longDescription ?? undefined,
    categoryId: c.categoryId ?? '',
    durationMinutes: String(c.durationMinutes),
    basePriceDollars: (c.basePriceCents / 100).toFixed(2),
    maxCapacity: String(c.maxCapacity),
    minToRun: String(c.minToRun),
    allowWaitlist: c.allowWaitlist,
    waitlistLimit: String(c.waitlistLimit),
    bufferBeforeMinutes: String(c.bufferBeforeMinutes),
    bufferAfterMinutes: String(c.bufferAfterMinutes),
    color: c.color ?? undefined,
    active: c.active,
    instructorIds: c.instructors.map((i) => i.staffId),
  };
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let klass: ClassWithInstructors;
  try {
    const result = await getClass(id);
    klass = result.class;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const [staffResp, categoriesResp, brandColors] = await Promise.all([
    listStaff({ active: true, take: 200 }),
    listServiceCategories({ take: 200 }),
    loadTenantBrandColors(),
  ]);
  const { staff } = staffResp;
  const { categories } = categoriesResp;

  const updateAction = updateClassAction.bind(null, id);
  const deleteAction = deleteClassAction.bind(null, id);

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

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Class</span>
          <h1 className="t-display-lg">{klass.name}</h1>
        </div>
        {klass.deletedAt ? (
          <Badge tone="red">
            Soft-deleted {new Date(klass.deletedAt).toLocaleString()}
          </Badge>
        ) : klass.active ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
      </header>

      <Card padding="lg">
        <ClassForm
          action={updateAction}
          initial={classToFormDefaults(klass)}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          staff={staff.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            jobTitle: s.jobTitle,
          }))}
          presets={brandColors}
          submitLabel="Save changes"
          successMessage="Class updated."
        />
      </Card>

      {!klass.deletedAt && (
        <Card padding="md" className="border border-red/20 bg-red-pale/40">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete class</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from booking and lists; preserves instructor assignments
                for the audit trail. Reversible by an admin via DB.
              </p>
            </div>
            <form action={deleteAction}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="text-red hover:bg-red-pale"
              >
                Soft-delete
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
