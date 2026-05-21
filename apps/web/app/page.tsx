import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

/**
 * `app.wellos.one/` — funnel for both signed-in and signed-out users.
 *
 * - Signed-in: jump straight into `/dashboard` (the post-auth landing).
 * - Signed-out: bounce to `/sign-in` so Clerk can authenticate.
 *
 * The marketing landing page (features, pricing, signup CTA) lives at
 * `wellos.one` — a separate Vercel project. `app.wellos.one` is the
 * app shell only.
 */
export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect('/dashboard');
  }
  redirect('/sign-in');
}
