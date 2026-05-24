import { GridIcon } from '@/app/admin/_shell/icons';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffServicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  return (
    <SectionHeader
      icon={GridIcon}
      eyebrow="SERVICES"
      headline={`What ${staff.firstName} performs.`}
      subtitle="Dedicated services picker coming next. Edit service assignments from the Overview form for now."
    >
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          Coming soon — the services picker is part of Phase 2 of the staff profile.
        </p>
      </div>
    </SectionHeader>
  );
}
