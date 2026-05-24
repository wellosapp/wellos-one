import { CalendarIcon } from '@/app/admin/_shell/icons';

import { BookingPreferencesCard } from '../BookingPreferencesCard';
import { CalendarFeedCard } from '../CalendarFeedCard';
import { SectionHeader } from '../_components/SectionHeader';
import { updateStaffBookingPrefsAction } from '../_booking-preferences-actions';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffBookingSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);

  const updatePrefsAction = updateStaffBookingPrefsAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={CalendarIcon}
        eyebrow="BOOKING SETTINGS"
        headline={`Booking overrides for ${staff.firstName}.`}
        subtitle="Per-staff buffer and minimum notice override the tenant defaults. Calendar sync controls whether external calendars push events back into Wellos. iCal feed publishes this staff member's schedule to read-only subscribers."
      />

      {staff.deletedAt ? (
        <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
          <p className="t-body-md text-ink-3">
            Booking settings are read-only for soft-deleted staff.
          </p>
        </div>
      ) : (
        <>
          <BookingPreferencesCard
            action={updatePrefsAction}
            initial={{
              bookingBufferMinutesOverride:
                staff.bookingBufferMinutesOverride === null
                  ? ''
                  : String(staff.bookingBufferMinutesOverride),
              bookingMinNoticeHoursOverride:
                staff.bookingMinNoticeHoursOverride === null
                  ? ''
                  : String(staff.bookingMinNoticeHoursOverride),
              bookingCalendarSyncOptedIn: staff.bookingCalendarSyncOptedIn,
            }}
          />
          <CalendarFeedCard staffId={staff.id} />
        </>
      )}
    </div>
  );
}
