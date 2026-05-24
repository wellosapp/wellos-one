import { CalendarIcon } from '@/app/admin/_shell/icons';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffBookingSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await loadStaffDetail(id);
  return (
    <SectionHeader
      icon={CalendarIcon}
      eyebrow="BOOKING SETTINGS"
      headline="Booking overrides + calendar sync."
      subtitle="Buffer time, min notice, calendar feed URL. Edit from Overview today; dedicated page coming next."
    >
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          Coming soon — the booking settings editor is part of Phase 2 of the staff profile.
        </p>
      </div>
    </SectionHeader>
  );
}
