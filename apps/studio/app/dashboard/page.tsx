import { UserButton } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';

export default async function DashboardPage() {
  const user = await currentUser();
  const name = user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? 'there';

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Hello, {name}</h1>
        <UserButton afterSignOutUrl="/" />
      </header>
      <p>Signed in. Protected dashboard stub for E1-S4. Real dashboard arrives in sub-step 6.</p>
    </main>
  );
}
