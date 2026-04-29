import { Card } from '@/components/ui';

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-s6 px-s6 py-s12">
      <header className="flex flex-col gap-s2">
        <span className="t-eyebrow text-accent">Wellos</span>
        <h1 className="t-display-xl">Multi-vertical booking, payments, and CRM.</h1>
        <p className="t-body-lg text-ink-soft">
          Salon, massage, medspa, fitness studio, personal training — one platform.
        </p>
      </header>
      <Card padding="md" className="text-ink-soft">
        <p className="t-body-md">
          Hello-world scaffold. The full app is under construction at{' '}
          <code className="rounded-sm bg-surface-2 px-s2 py-[2px] t-body-sm">app.wellos.one</code>.
        </p>
      </Card>
    </main>
  );
}
