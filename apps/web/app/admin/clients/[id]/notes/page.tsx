import { Card } from '@/components/ui';

export default function ClientNotesTabPage() {
  return (
    <Card
      padding="lg"
      className="rounded-2xl border border-surface-3 bg-white shadow-sm"
    >
      <span className="t-eyebrow text-accent">Notes</span>
      <h2 className="mt-s2 font-display t-display-sm text-ink">
        Client notes (preview)
      </h2>
      <p className="mt-s3 max-w-2xl t-body-md leading-relaxed text-ink-soft">
        A dedicated notes hub for this profile is planned. Today, capture notes
        from appointment drawers, calendar Quick Book follow-ups, and visit
        timeline entries.
      </p>
    </Card>
  );
}
