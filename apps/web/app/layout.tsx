import type { Metadata } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wellos',
  description: 'Wellos — multi-vertical booking, payments, and CRM platform',
};

// ClerkProvider validates NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY at module import,
// so prerendering any route without that env var crashes the build. Forcing
// dynamic skips prerender; routes render on-demand at request time when the
// env is present. Revisit if/when a static marketing surface needs SSG.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${dmSans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
