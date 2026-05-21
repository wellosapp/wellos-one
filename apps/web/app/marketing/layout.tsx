import type { Metadata } from 'next';

import { Footer } from './_components/Footer';
import { Header } from './_components/Header';

export const metadata: Metadata = {
  title: 'Wellos — Booking, payments, and CRM for boutique wellness businesses',
  description:
    'Wellos is the all-in-one booking, payments, messaging, and intake platform for salons, massage, medspa, fitness studios, and personal trainers.',
};

/**
 * Marketing layout wraps every /marketing/* route with the shared header and
 * footer. It does NOT call Clerk — marketing is public-by-design. The
 * top-level RootLayout (apps/web/app/layout.tsx) still renders ClerkProvider,
 * but ClerkProvider is render-only; without a `requireAuth` call there's no
 * redirect.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
