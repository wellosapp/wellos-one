import { UserButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';

import { Card } from '@/components/ui';

export default async function DashboardPage() {
  const user = await currentUser();
  const name = user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? 'there';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-s6 px-s6 py-s10">
      <header className="flex items-center justify-between">
        <h1 className="t-display-lg">Hello, {name}</h1>
        <UserButton afterSignOutUrl="/" />
      </header>
      <Card>
        <p className="t-body-md text-ink-soft">
          Signed in. Protected dashboard stub for E1-S4. Real dashboard arrives in sub-step 6.
        </p>
      </Card>
    </main>
  );
}
