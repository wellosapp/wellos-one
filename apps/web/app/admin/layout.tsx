import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

// Admin shell. Header with nav + UserButton, body slot for child routes.
//
// Styling: inline styles, mirroring apps/web/app/dashboard/page.tsx. The
// design system bootstrap (Tailwind + tokens from 10-design-system-buildout.md)
// is its own focused PR — admin UI gets re-skinned then. Keep this scaffold
// functional and minimal until then.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #e5e5e5',
          background: '#fafafa',
        }}
      >
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <Link
            href="/admin"
            style={{ fontWeight: 600, textDecoration: 'none', color: '#111' }}
          >
            Wellos Admin
          </Link>
          <Link href="/admin/clients" style={{ color: '#444', textDecoration: 'none' }}>
            Clients
          </Link>
        </nav>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main style={{ flex: 1, padding: '1.5rem 2rem' }}>{children}</main>
    </div>
  );
}
