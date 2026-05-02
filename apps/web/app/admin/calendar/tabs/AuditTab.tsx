'use client';

import { Card } from '@/components/ui';
import type { Appointment } from '@/lib/api/appointments';
import { formatDateTimeLocal } from '@/lib/calendar';

interface AuditTabProps {
  appointment: Appointment;
}

// Minimal audit view — what we have on Appointment today: createdAt and the
// cancel triple. A full status-change log lands with a follow-up
// `appointment_audit_log` table; the events bus already exists per CLAUDE.md
// §4.10 so the projection is straightforward.
export function AuditTab({ appointment }: AuditTabProps) {
  return (
    <div className="flex flex-col gap-s4">
      <Card padding="md" className="border border-surface-3">
        <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
          <div className="flex flex-col gap-s1">
            <dt className="t-caption text-ink-soft">Created</dt>
            <dd className="t-body-md text-ink">
              {formatDateTimeLocal(appointment.createdAt)}
            </dd>
          </div>
          <div className="flex flex-col gap-s1">
            <dt className="t-caption text-ink-soft">Last update</dt>
            <dd className="t-body-md text-ink">
              {formatDateTimeLocal(appointment.updatedAt)}
            </dd>
          </div>
          {appointment.cancelledAt && (
            <>
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Cancelled at</dt>
                <dd className="t-body-md text-ink">
                  {formatDateTimeLocal(appointment.cancelledAt)}
                </dd>
              </div>
              <div className="flex flex-col gap-s1">
                <dt className="t-caption text-ink-soft">Cancel reason</dt>
                <dd className="t-body-md text-ink">
                  {appointment.cancelReason ?? '—'}
                </dd>
              </div>
            </>
          )}
        </dl>
      </Card>

      <p className="t-body-sm italic text-ink-soft">
        Full status-change audit log ships with a follow-up ticket — the
        events bus already records every transition; this view will hydrate
        from the projection.
      </p>
    </div>
  );
}
