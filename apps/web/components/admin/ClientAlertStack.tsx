import { Badge } from '@/components/ui';
import type { ClientNoteSummary } from '@/lib/api/timeline';

import { NoteCategoryBadge } from './NoteCategoryBadge';

// Always-visible stack at the top of the client profile / timeline. Surfaces
// priority='alert' notes (allergy / medical / clinical / behavioral) so
// staff hit them before they hit anything else. Per master-spec §5.2.3 +
// walkthrough §6.
//
// Empty list → render nothing (no "no alerts" placeholder; absence is its
// own signal).

export function ClientAlertStack({ alerts }: { alerts: ClientNoteSummary[] }) {
  if (alerts.length === 0) return null;

  return (
    <section
      className="rounded-md border border-red/30 bg-red-pale/40 p-s4"
      role="alert"
      aria-label="Client alerts"
    >
      <header className="mb-s3 flex items-center gap-s2">
        <span aria-hidden="true" className="t-body-md font-medium text-red">
          ⚠
        </span>
        <h2 className="t-display-sm text-red">Client alerts</h2>
        <Badge tone="red">{alerts.length}</Badge>
      </header>

      <ul className="flex flex-col gap-s3">
        {alerts.map((note) => (
          <li
            key={note.id}
            className="rounded-sm bg-white p-s3 shadow-sm"
          >
            <div className="mb-s1 flex flex-wrap items-center gap-s2">
              <NoteCategoryBadge category={note.category} />
              {note.alertTriggers.length > 0 && (
                <Badge tone="amber">
                  Fires:{' '}
                  {note.alertTriggers
                    .map((t) => t.replace('_', '-'))
                    .join(', ')}
                </Badge>
              )}
              {note.pinned && <Badge tone="accent">Pinned</Badge>}
            </div>
            {note.title && (
              <div className="t-body-md font-medium text-ink">{note.title}</div>
            )}
            <p className="t-body-md text-ink">{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
