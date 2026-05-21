import type { Metadata } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Editorial serif display face. Used by every heading + the t-display-*
// utility classes. Variable name `--font-display` is intentionally font-
// agnostic so a future face swap doesn't require touching every component
// that references it.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

// Sans body face. Manrope's geometric warmth pairs with the serif display.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
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
    <html lang="en" className={`${instrumentSerif.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
