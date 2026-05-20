import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listServices } from '@/lib/api/services';
import { getStaff, DAY_KEYS, type DayKey } from '@/lib/api/staff';

import { StaffForm } from '../StaffForm';
import type { StaffFormValues } from '../_actions';
import { deleteStaffAction, updateStaffAction } from '../_actions';
import { CalendarFeedCard } from './CalendarFeedCard';

function staffToFormDefaults(
  s: Awaited<ReturnType<typeof getStaff>>['staff'],
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

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let staff;
  try {
    const result = await getStaff(id);
    staff = result.staff;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const { services } = await listServices({ active: true, take: 200 });

  const updateAction = updateStaffAction.bind(null, id);
  const deleteAction = deleteStaffAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/staff"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to staff
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Staff</span>
          <h1 className="t-display-lg">
            {staff.firstName}
            {staff.lastName ? ` ${staff.lastName}` : ''}
          </h1>
          {staff.jobTitle && (
            <span className="t-body-md text-ink-soft">{staff.jobTitle}</span>
          )}
        </div>
        {staff.deletedAt ? (
          <Badge tone="red">
            Soft-deleted {new Date(staff.deletedAt).toLocaleString()}
          </Badge>
        ) : staff.active ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
      </header>

      <Card padding="lg">
        <StaffForm
          action={updateAction}
          initial={staffToFormDefaults(staff)}
          services={services.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          submitLabel="Save changes"
          successMessage="Staff updated."
        />
      </Card>

      {!staff.deletedAt && <CalendarFeedCard staffId={staff.id} />}

      {!staff.deletedAt && (
        <Card padding="md" className="border border-red/20 bg-red-pale/40">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete staff</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from booking and lists; preserves service assignments for the
                audit trail. Reversible by an admin via DB.
              </p>
            </div>
            <form action={deleteAction}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="text-red hover:bg-red-pale"
              >
                Soft-delete
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
