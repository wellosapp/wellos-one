import { Card } from '@/components/ui';

type Props = {
  total: number;
  draft: number;
  published: number;
  archived: number;
};

export function StaffOnboardingFormsStatsRow({ total, draft, published, archived }: Props) {
  const items = [
    { label: 'All versions', value: total, hint: 'Rows across every form family' },
    { label: 'Drafts', value: draft, hint: 'Unpublished edits' },
    { label: 'Published', value: published, hint: 'Live for assignment' },
    { label: 'Archived', value: archived, hint: 'History only' },
  ];

  return (
    <div className="grid gap-s3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.label}
          padding="md"
          className="border border-surface-3 bg-white shadow-sm"
        >
          <p className="t-caption text-ink-soft">{item.label}</p>
          <p className="mt-s1 font-display t-display-sm tabular-nums text-ink">{item.value}</p>
          <p className="mt-s2 t-caption leading-snug text-ink-soft">{item.hint}</p>
        </Card>
      ))}
    </div>
  );
}
