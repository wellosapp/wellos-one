import type { Metadata, Viewport } from 'next';
import './globals.css';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
