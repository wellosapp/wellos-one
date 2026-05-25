import { notFound } from 'next/navigation';

import { Alert } from '@/components/ui';
import {
  getClassInstanceRoster,
  getClassInstanceSummary,
} from '@/lib/api/class-bookings';
import {
  getClassInstance,
  type ClassInstanceWithRelations,
} from '@/lib/api/class-instances';
import { ApiError } from '@/lib/api/client';
import { listStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';

import { ClassInstanceHeader } from './ClassInstanceHeader';
import { ClassInstanceSummary } from './ClassInstanceSummary';
import { ClassRosterTable } from './ClassRosterTable';

// /staff/classes/[instanceId] — Phase 4 of the Classes epic.
// Staff opens this page to take attendance on a single class instance.
// Parallel-fetches the instance, roster, summary, whoami, and the staff
// directory (for the "Checked in by Sarah" caption). 404s on instance
// not found. Admin/manager users get lifecycle controls + client deep
// links; staff get the roster only.

export default async function StaffClassInstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;

  let instance: ClassInstanceWithRelations | null = null;
  let roster: Awaited<ReturnType<typeof getClassInstanceRoster>> | null = null;
  let summary: Awaited<ReturnType<typeof getClassInstanceSummary>> | null =
    null;
  let whoami: Awaited<ReturnType<typeof getWhoami>> | null = null;
  let staffList: Awaited<ReturnType<typeof listStaff>> | null = null;
  let loadError: string | null = null;

  try {
    [instance, roster, summary, whoami, staffList] = await Promise.all([
      getClassInstance(instanceId).then((r) => r.instance),
      getClassInstanceRoster(instanceId, { includeCancelled: true }),
      getClassInstanceSummary(instanceId),
      getWhoami(),
      // Used only to resolve checkedInByStaffId → display name. Active staff
      // only — historical names linger on the audit log if needed.
      listStaff({ active: true, take: 500 }),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    if (err instanceof ApiError && err.status === 403) {
      loadError = 'You do not have access to this class.';
    } else if (err instanceof ApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">Class roster</h1>
        <Alert tone="error">{loadError}</Alert>
      </div>
    );
  }

  if (!instance || !roster || !summary) {
    notFound();
  }

  const roles = whoami?.roles ?? [];
  const isAdminOrManager =
    roles.includes('super_admin') ||
    roles.includes('admin') ||
    roles.includes('manager');

  // Capacity meter inputs. The instance carries an override; otherwise the
  // template's max applies. Counts come from the roster we already fetched
  // so we don't pay for a separate aggregation call here.
  const capacity =
    instance.capacityOverride ?? instance.class.maxCapacity;
  const activeBookedCount = roster.bookings.filter(
    (b) => b.state === 'confirmed' || b.state === 'checked_in',
  ).length;
  const checkedInCount = roster.bookings.filter(
    (b) => b.state === 'checked_in',
  ).length;

  const staffNameById: Record<string, string> = {};
  for (const s of staffList?.staff ?? []) {
    const name = [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
    if (name) staffNameById[s.id] = name;
  }

  return (
    <div className="flex flex-col gap-s5">
      <ClassInstanceHeader
        instance={instance}
        checkedInCount={checkedInCount}
        activeBookedCount={activeBookedCount}
        capacity={capacity}
        isAdminOrManager={isAdminOrManager}
      />

      <ClassRosterTable
        instanceId={instance.id}
        bookings={roster.bookings}
        staffNameById={staffNameById}
        canLinkToClient={isAdminOrManager || roles.includes('staff')}
      />

      {instance.state === 'completed' && (
        <ClassInstanceSummary summary={summary.summary} />
      )}
    </div>
  );
}
