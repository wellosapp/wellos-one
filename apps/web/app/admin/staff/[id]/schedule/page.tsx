import { ClockIcon } from '@/app/admin/_shell/icons';
import { DAY_KEYS, type DayKey } from '@/lib/staff-days';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';
import type { WorkingHoursFormValues } from './_actions';
import { WorkingHoursEditor } from './WorkingHoursEditor';

export default async function StaffSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);

  // Working hours JSONB → per-day form rows. Pull the FIRST shift only
  // (multi-shift UI deferred). Mirrors staffToFormDefaults in
  // staff/[id]/page.tsx — extract if a third caller appears.
  const initial: WorkingHoursFormValues = {};
  for (const day of DAY_KEYS as readonly DayKey[]) {
    const shifts = staff.workingHours?.[day];
    if (shifts && shifts.length > 0) {
      initial[day] = { closed: false, start: shifts[0]!.start, end: shifts[0]!.end };
    } else {
      initial[day] = { closed: true };
    }
  }

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={ClockIcon}
        eyebrow="SCHEDULE"
        headline={`Working hours for ${staff.firstName}.`}
        subtitle="Per-day shifts that determine when this staff member is bookable. Closed days are excluded from the public calendar. Multi-shift schedules and exception calendars land in a follow-up."
      >
        <WorkingHoursEditor
          staffId={id}
          initial={initial}
          readOnly={Boolean(staff.deletedAt)}
        />
      </SectionHeader>
    </div>
  );
}
