import { Card } from '@/components/ui';

export default function ClientActivityTabPage() {
  return (
    <Card
      padding="lg"
      className="rounded-2xl border border-surface-3 bg-white shadow-sm"
    >
      <span className="t-eyebrow text-accent">Activity</span>
      <h2 className="mt-s2 font-display t-display-sm text-ink">
        Audit trail (preview)
      </h2>
      <p className="mt-s3 max-w-2xl t-body-md leading-relaxed text-ink-soft">
        Staff-visible activity — edits, bookings, messages — will aggregate
        here. Related visits remain on the Visits tab.
      </p>
    </Card>
  );
}
