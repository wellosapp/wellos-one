import { Card } from '@/components/ui';

export default function ClientIntakeTabPage() {
  return (
    <Card
      padding="lg"
      className="rounded-2xl border border-surface-3 bg-white shadow-sm"
    >
      <span className="t-eyebrow text-accent">Intake</span>
      <h2 className="mt-s2 font-display t-display-sm text-ink">
        Intake responses (preview)
      </h2>
      <p className="mt-s3 max-w-2xl t-body-md leading-relaxed text-ink-soft">
        Completed intake forms and questionnaires linked to this client will
        surface here when that pipeline ships.
      </p>
    </Card>
  );
}
