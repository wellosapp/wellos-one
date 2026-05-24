import { TrendUpIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';

// Coming-soon stub for the Activity section. Audit events ARE written to
// the AuditLog table on every mutation — but there's no
// `GET /admin/clients/:clientId/activity` endpoint yet to read them back
// scoped to one client. Once the backend ticket lands, this stub gets
// replaced with a real timeline.

export function ActivityComingSoon({ firstName }: { firstName: string }) {
  return (
    <SectionHeader
      icon={TrendUpIcon}
      eyebrow="ACTIVITY"
      headline={`Audit trail for ${firstName}.`}
      subtitle="Staff-visible activity — edits, bookings, payments, messages — is already being recorded behind the scenes for every change on this client. A per-client view of that audit feed is coming soon. Related visits remain on the Visits tab."
    >
      <div
        className={cn(
          'rounded-md border border-line bg-surface-2 p-s8 text-center',
        )}
      >
        <p className="t-body-md text-ink-3">
          Coming soon — per-client audit feed lands when the backend
          <span className="mx-s1 rounded-sm bg-surface-3 px-s2 py-[1px] font-mono text-[12px] text-ink-2">
            GET /admin/clients/:id/activity
          </span>
          endpoint ships.
        </p>
      </div>
    </SectionHeader>
  );
}
