import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Wellos Studio',
  description:
    'Wellos Studio — lighter booking, payments, and CRM for solo practitioners and small studios',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Wellos Studio',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1a1a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
