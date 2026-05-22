import { cn } from '@/lib/cn';

// Coming-soon stub for the Activity section. Audit events ARE written to
// the AuditLog table on every mutation — but there's no `GET
// /admin/clients/:clientId/activity` endpoint yet to read them back scoped
// to one client. Once the backend ticket lands (see plan §"Out of scope"),
// this stub gets replaced with a real timeline.

export function ActivityComingSoon() {
  return (
    <section
      className={cn(
        'rounded-md border border-line bg-surface p-s6 shadow-sm',
        'lg:p-s8',
      )}
    >
      <div className="t-eyebrow text-sage">Activity</div>
      <h2 className="mt-s2 font-display text-[26px] text-ink">
        Audit trail.
      </h2>
      <p
        className={cn(
          'mt-s3 max-w-2xl font-display italic',
          't-body-md leading-relaxed text-ink-3',
        )}
      >
        Staff-visible activity — edits, bookings, payments, messages — is
        already being recorded behind the scenes for every change on this
        client. A per-client view of that audit feed is coming soon. Related
        visits remain on the Visits tab.
      </p>
    </section>
  );
}
