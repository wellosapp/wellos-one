import { ClockIcon } from '@/app/admin/_shell/icons';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  return (
    <SectionHeader
      icon={ClockIcon}
      eyebrow="SCHEDULE"
      headline={`Working hours for ${staff.firstName}.`}
      subtitle="A dedicated per-day shifts editor lands in a follow-up. For now, edit working hours from the Overview form."
    >
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          Coming soon — the schedule editor is part of Phase 2 of the staff profile.
        </p>
      </div>
    </SectionHeader>
  );
}
