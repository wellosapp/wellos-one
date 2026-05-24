import { ClipboardIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  listStaffOnboardingFormDefinitions,
  listStaffOnboardingSubmissions,
} from '@/lib/api/staff-onboarding-forms';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

import { StaffFormsPanel } from './StaffFormsPanel';

export default async function StaffFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: staffId } = await params;
  const staff = await loadStaffDetail(staffId);

  let loadError: string | null = null;
  let publishedForms: Awaited<
    ReturnType<typeof listStaffOnboardingFormDefinitions>
  >['definitions'] = [];
  let submissions: Awaited<
    ReturnType<typeof listStaffOnboardingSubmissions>
  >['submissions'] = [];

  try {
    const [defsRes, subRes] = await Promise.all([
      listStaffOnboardingFormDefinitions({ status: 'published' }),
      listStaffOnboardingSubmissions(staffId),
    ]);
    publishedForms = defsRes.definitions;
    submissions = subRes.submissions;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load onboarding forms. Is the API running?';
  }

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={ClipboardIcon}
        eyebrow="FORMS"
        headline={`Onboarding forms for ${staff.firstName}.`}
        subtitle="Tax forms, license, certifications. Submitting locks the answers and writes an audit row."
      />

      {loadError ? (
        <div
          className={cn(
            'rounded-md border border-amber/30 bg-amber-pale/60 p-s4',
            't-body-sm text-amber',
          )}
        >
          {loadError}
        </div>
      ) : (
        <StaffFormsPanel
          staffId={staffId}
          publishedForms={publishedForms}
          submissions={submissions}
        />
      )}
    </div>
  );
}
