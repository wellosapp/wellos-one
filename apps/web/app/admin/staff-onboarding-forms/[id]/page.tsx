import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getStaffOnboardingFormDefinition } from '@/lib/api/staff-onboarding-forms';

import { StaffOnboardingFormEditor } from '../StaffOnboardingFormEditor';

export default async function StaffOnboardingFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const { definition } = await getStaffOnboardingFormDefinition(id);
    return (
      <div>
        <Link
          href="/admin/staff-onboarding-forms"
          className="t-body-sm text-accent hover:underline"
        >
          ← All staff onboarding forms
        </Link>
        <div className="mt-s4">
          <StaffOnboardingFormEditor definition={definition} />
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}
