'use client';

import { Card } from '@/components/ui';

// Empty state — appointment-scoped media listing endpoint lands with the
// next E3-S6 ticket (`GET /admin/appointments/:id/media`). Until then we
// surface the planned UI as a placeholder so the drawer feels complete.
export function FilesTab() {
  return (
    <Card padding="lg" className="border border-dashed border-surface-3 bg-surface-2/40">
      <div className="flex flex-col gap-s2">
        <span className="t-eyebrow text-accent">Coming with E3-S6</span>
        <h3 className="t-display-sm text-ink">Files panel not yet wired</h3>
        <p className="t-body-md text-ink-soft">
          Reference photos, intake docs, consent forms, and receipts will list
          here. The R2 storage layer is shipped (E3-S4c, S4g); the
          appointment-scoped read endpoint comes next.
        </p>
      </div>
    </Card>
  );
}
