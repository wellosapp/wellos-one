import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wellos',
  description: 'Wellos — multi-vertical booking, payments, and CRM platform',
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
