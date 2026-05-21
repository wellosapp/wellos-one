// Admin overview — the operational dashboard.
//
// Server component. Fetches the full snapshot via getOverviewData() (which
// fans out to the appointments / clients / staff / services lists in
// parallel and computes every KPI + chart + schedule from raw data) and
// composes the AlertsStrip → KpiStrip → ScheduleStrip → (RevenueChart |
// QuickActions) layout from the design package.
//
// The legacy 3-card "Tenant resources" page now lives at /admin/resources.

import {
  CalendarIcon,
  DollarIcon,
  UserPlusIcon,
  ZapIcon,
} from './_shell/icons';
import { AlertsStrip } from './_overview/AlertsStrip';
import { KpiCard } from './_overview/KpiCard';
import { KpiStrip } from './_overview/KpiStrip';
import { QuickActions } from './_overview/QuickActions';
import { RevenueChart } from './_overview/RevenueChart';
import { ScheduleStrip } from './_overview/ScheduleStrip';
import { getOverviewData } from './_overview/data';

export default async function AdminHomePage() {
  const data = await getOverviewData();

  return (
    <div className="flex flex-col gap-s5">
      <AlertsStrip alerts={data.alerts} />

      <KpiStrip>
        <KpiCard
          id="bookings"
          label="Bookings today"
          icon={<CalendarIcon size={14} />}
          value={data.bookings.value}
          delta={data.bookings.delta}
          sparkline={data.bookings.sparkline}
        />
        <KpiCard
          id="revenue"
          label="Revenue this week"
          icon={<DollarIcon size={14} />}
          value={data.revenue.value}
          unit="$"
          delta={data.revenue.delta}
          sparkline={data.revenue.sparkline}
        />
        <KpiCard
          id="clients"
          label="New clients this week"
          icon={<UserPlusIcon size={14} />}
          value={data.newClients.value}
          delta={data.newClients.delta}
          sparkline={data.newClients.sparkline}
        />
        <KpiCard
          id="utilization"
          label="Studio utilization"
          icon={<ZapIcon size={14} />}
          value={data.utilization.value}
          unit="%"
          delta={data.utilization.delta}
          sparkline={data.utilization.sparkline}
        />
      </KpiStrip>

      <ScheduleStrip
        appointments={data.todaysSchedule}
        dateLabel={data.todayLabel}
      />

      <div className="grid grid-cols-1 gap-s4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueChart {...data.revenueChart} />
        </div>
        <div className="lg:col-span-4">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
