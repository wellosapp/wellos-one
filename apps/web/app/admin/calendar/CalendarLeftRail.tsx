import type { Appointment } from '@/lib/api/appointments';

import { CalendarFilterPills } from './CalendarFilterPills';
import {
  CalendarStaffLoadStrip,
  type StaffLoadRow,
} from './CalendarStaffLoadStrip';
import { CalendarRiverSessionDetail } from './CalendarRiverSessionDetail';

interface CalendarLeftRailProps {
  staffLoad: StaffLoadRow[];
  selectedAppointment?: Appointment;
  selectedClientFirstName?: string;
  selectedServiceName?: string;
  selectedStaffFirstName?: string;
}

/**
 * ~280px sticky-left column for the admin day view. Rendered only when
 * view === 'day' by the parent (CalendarDayView). Week/Month branches skip
 * the rail entirely.
 */
export function CalendarLeftRail({
  staffLoad,
  selectedAppointment,
  selectedClientFirstName,
  selectedServiceName,
  selectedStaffFirstName,
}: CalendarLeftRailProps) {
  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col gap-s4"
      aria-label="Calendar context"
    >
      <CalendarStaffLoadStrip rows={staffLoad} />
      <div className="rounded-md border border-surface-3 bg-white p-s4 shadow-sm">
        <CalendarFilterPills variant="rail" />
      </div>
      <CalendarRiverSessionDetail
        appointment={selectedAppointment}
        clientFirstName={selectedClientFirstName}
        serviceName={selectedServiceName}
        staffFirstName={selectedStaffFirstName}
      />
    </aside>
  );
}
