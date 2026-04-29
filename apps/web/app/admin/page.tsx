import Link from 'next/link';

import { Card } from '@/components/ui';

type Surface =
  | { title: string; description: string; status: 'live'; href: '/admin/clients' }
  | { title: string; description: string; status: 'soon' };

const SURFACES: Surface[] = [
  {
    href: '/admin/clients',
    title: 'Clients',
    description: 'Create, edit, and soft-delete client records. Search and filter by intake status.',
    status: 'live',
  },
  {
    title: 'Services',
    description: 'Service catalog with duration, base price, and eligible staff.',
    status: 'soon',
  },
  {
    title: 'Staff',
    description: 'Staff members, working hours, commission rates, and service eligibility.',
    status: 'soon',
  },
];

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-s8">
      <header className="flex flex-col gap-s2">
        <span className="t-eyebrow text-accent">Admin</span>
        <h1 className="t-display-lg">Tenant resources</h1>
        <p className="t-body-md text-ink-soft">
          Manage tenant-scoped data. Backend at{' '}
          <code className="rounded-sm bg-surface-2 px-s2 py-[2px] t-body-sm">api.wellos.one</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map((s) => {
          const isLive = s.status === 'live';
          const inner = (
            <Card
              padding="md"
              className={
                isLive
                  ? 'h-full transition-[transform,box-shadow] duration-fast hover:-translate-y-px hover:shadow-md'
                  : 'h-full opacity-60'
              }
            >
              <div className="flex h-full flex-col gap-s3">
                <div className="flex items-baseline justify-between gap-s2">
                  <h2 className="t-display-sm">{s.title}</h2>
                  {!isLive && (
                    <span className="t-eyebrow text-ink-soft">Soon</span>
                  )}
                </div>
                <p className="t-body-md text-ink-soft">{s.description}</p>
              </div>
            </Card>
          );

          if (s.status === 'soon') return <div key={s.title}>{inner}</div>;
          return (
            <Link key={s.title} href={s.href} className="no-underline">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
