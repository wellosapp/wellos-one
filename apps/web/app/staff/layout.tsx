import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-surface-3 bg-white/70 px-s8 py-s4 backdrop-blur">
        <nav className="flex flex-wrap items-center gap-x-s8 gap-y-s2">
          <Link
            href="/staff/schedule"
            className="t-display-sm font-display text-ink no-underline"
          >
            Wellos Staff
          </Link>
          <Link
            href="/staff/schedule"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            My schedule
          </Link>
          <Link
            href="/admin/clients"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Clients
          </Link>
          <Link
            href="/admin/services"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Services
          </Link>
          <Link
            href="/admin/media"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Media
          </Link>
        </nav>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-s8 py-s8">{children}</main>
    </div>
  );
}
