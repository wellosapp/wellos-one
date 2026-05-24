import Link from 'next/link';
import type { Route } from 'next';

import { Badge, Card } from '@/components/ui';
import type {
  ClassInstanceState,
  ClassInstanceWithRelations,
} from '@/lib/api/class-instances';
import { formatDateTimeLocal } from '@/lib/calendar';

import { CancelInstanceButton } from './CancelInstanceButton';
import { cancelInstanceAction } from './_actions';

type Props = {
  classId: string;
  instances: ClassInstanceWithRelations[];
};

const STATE_LABELS: Record<ClassInstanceState, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function stateBadge(state: ClassInstanceState) {
  switch (state) {
    case 'scheduled':
      return <Badge tone="neutral">{STATE_LABELS[state]}</Badge>;
    case 'in_progress':
      return <Badge tone="green">{STATE_LABELS[state]}</Badge>;
    case 'completed':
      return <Badge tone="accent">{STATE_LABELS[state]}</Badge>;
    case 'cancelled':
      return <Badge tone="red">{STATE_LABELS[state]}</Badge>;
  }
}

function staffName(staff: ClassInstanceWithRelations['staff']): string {
  return `${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`;
}

function calendarHrefForInstance(
  iso: string,
  instanceId: string,
): Route {
  const d = new Date(iso);
  const dateParam = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `/admin/calendar?date=${dateParam}&classInstance=${instanceId}` as Route;
}

export function InstancesTable({ classId, instances }: Props) {
  if (instances.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="t-body-md text-ink-soft">
          No instances scheduled yet. Use the form above to add the first
          one-off occurrence.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="sm" className="overflow-hidden p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">When</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Instructor</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Location</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">State</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => {
            const cancelAction = cancelInstanceAction.bind(
              null,
              classId,
              inst.id,
            );
            return (
              <tr
                key={inst.id}
                className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
              >
                <td className="px-s4 py-s3 t-body-md">
                  {formatDateTimeLocal(inst.scheduledStartAt)}
                </td>
                <td className="px-s4 py-s3 t-body-md text-ink-soft">
                  {staffName(inst.staff)}
                </td>
                <td className="px-s4 py-s3 t-body-md text-ink-soft">
                  {inst.location.name}
                </td>
                <td className="px-s4 py-s3">
                  {stateBadge(inst.state)}
                </td>
                <td className="px-s4 py-s3">
                  <div className="flex items-center justify-end gap-s3">
                    <Link
                      href={calendarHrefForInstance(
                        inst.scheduledStartAt,
                        inst.id,
                      )}
                      className="t-body-sm text-accent no-underline hover:underline"
                    >
                      View on calendar
                    </Link>
                    {inst.state !== 'cancelled' && (
                      <CancelInstanceButton action={cancelAction} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
