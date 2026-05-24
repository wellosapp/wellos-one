import { Button } from '@/components/ui';
import { UserIcon, WarnIcon } from '@/app/admin/_shell/icons';
import { listServices } from '@/lib/api/services';
import { DAY_KEYS, type DayKey } from '@/lib/api/staff';

import { StaffForm } from '../StaffForm';
import type { StaffFormValues } from '../_actions';
import { deleteStaffAction, updateStaffAction } from '../_actions';
import { SectionHeader } from './_components/SectionHeader';
import { loadStaffDetail } from './_components/_data';

function staffToFormDefaults(
  s: Awaited<ReturnType<typeof loadStaffDetail>>,
): StaffFormValues {
  // Working hours JSONB → per-day form rows. Pull the FIRST shift only
  // (UI defers multi-shift; the backend preserves multi-shift data on
  // edit because we only emit single-shift back, but if the user is
  // editing a record that already has multi-shift data, we surface only
  // the first shift here. Not destructive on save unless the user
  // submits — and if they do, multi-shift gets collapsed. Acceptable
  // tradeoff for MVP; revisit when multi-shift UI ships).
  const workingHours: NonNullable<StaffFormValues['workingHours']> = {};
  for (const day of DAY_KEYS as readonly DayKey[]) {
    const shifts = s.workingHours?.[day];
    if (shifts && shifts.length > 0) {
      workingHours[day] = {
        closed: false,
        start: shifts[0]!.start,
        end: shifts[0]!.end,
      };
    } else {
      workingHours[day] = { closed: true };
    }
  }

  const commissionRatePct =
    s.commissionRatePct === null
      ? undefined
      : typeof s.commissionRatePct === 'string'
        ? s.commissionRatePct
        : s.commissionRatePct.toFixed(2);

  return {
    firstName: s.firstName,
    lastName: s.lastName ?? undefined,
    email: s.email ?? undefined,
    phone: s.phone ?? undefined,
    jobTitle: s.jobTitle ?? undefined,
    hourlyRateDollars:
      s.hourlyRateCents === null
        ? undefined
        : (s.hourlyRateCents / 100).toFixed(2),
    commissionRatePct,
    active: s.active,
    workingHours,
    serviceIds: s.serviceIds,
  };
}

export default async function StaffOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  const { services } = await listServices({ active: true, take: 200 });

  const updateAction = updateStaffAction.bind(null, id);
  const deleteAction = deleteStaffAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={UserIcon}
        eyebrow="OVERVIEW"
        headline={`Overview for ${staff.firstName}.`}
        subtitle="Personal information and compensation. Working hours live in the Schedule tab; service assignments in the Services tab; booking overrides + iCal feed in the Booking settings tab."
      >
        <StaffForm
          action={updateAction}
          initial={staffToFormDefaults(staff)}
          services={services.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          submitLabel="Save changes"
          successMessage="Staff updated."
          hideServicesFieldset
          hideWorkingHoursFieldset
        />
      </SectionHeader>

      {!staff.deletedAt && (
        <SectionHeader
          icon={WarnIcon}
          eyebrow="DANGER ZONE"
          headline="Soft-delete this staff member."
          subtitle="Hides from booking and lists; preserves service assignments for the audit trail."
          tone="danger"
        >
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex max-w-xl flex-col gap-s1">
              <h3 className="font-display text-[18px] text-ink">
                Remove from active lists
              </h3>
              <p className="t-body-sm leading-relaxed text-ink-3">
                Soft-delete hides this staff member from booking flows and admin
                lists while preserving service assignment history. Restoration
                is a database admin task today.
              </p>
            </div>
            <form action={deleteAction}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="whitespace-nowrap text-red hover:bg-red-pale"
              >
                Soft-delete staff
              </Button>
            </form>
          </div>
        </SectionHeader>
      )}
    </div>
  );
}
