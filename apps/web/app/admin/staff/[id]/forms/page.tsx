import { ClipboardIcon } from '@/app/admin/_shell/icons';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  return (
    <SectionHeader
      icon={ClipboardIcon}
      eyebrow="FORMS"
      headline={`Onboarding forms for ${staff.firstName}.`}
      subtitle="Coming soon — staff onboarding form flow (W9, license, certifications)."
    >
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          Coming soon — staff onboarding forms ship in a follow-up.
        </p>
      </div>
    </SectionHeader>
  );
}
