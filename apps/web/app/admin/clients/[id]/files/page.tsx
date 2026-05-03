import { Card } from '@/components/ui';

export default function ClientFilesTabPage() {
  return (
    <Card
      padding="lg"
      className="rounded-2xl border border-surface-3 bg-white shadow-sm"
    >
      <span className="t-eyebrow text-accent">Files</span>
      <h2 className="mt-s2 font-display t-display-sm text-ink">
        Documents &amp; media (preview)
      </h2>
      <p className="mt-s3 max-w-2xl t-body-md leading-relaxed text-ink-soft">
        Tenant-scoped file sharing tied to appointments and intake will appear
        here. Until then, use Media Library and appointment attachments where
        enabled.
      </p>
    </Card>
  );
}
