import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PwaInstallProvider } from './_pwa/PwaInstallProvider';

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
  // PWA manifest. Next.js emits `<link rel="manifest" href="/manifest.json">`.
  manifest: '/manifest.json',
  // iOS Safari hints. `apple-mobile-web-app-capable` lets the PWA run
  // standalone (no Safari chrome) once added to the home screen, and the
  // touch icon shows up on the iOS home grid. Color hex literals match
  // the manifest theme_color (--color-sage-deep token).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Wellos',
  },
  icons: {
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

// Next 14 Metadata API: themeColor + viewport live on a separate `viewport`
// export, not on `metadata`. Hex matches manifest.json theme_color and the
// --color-sage-deep design token (#3D7A5E) — manifest.json can't reference
// CSS vars so the literal is the source of truth here.
export const viewport: Viewport = {
  themeColor: '#3D7A5E',
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
        <Providers>
          <PwaInstallProvider>{children}</PwaInstallProvider>
        </Providers>
      </body>
    </html>
  );
}
