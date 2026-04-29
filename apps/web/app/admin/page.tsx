import Link from 'next/link';

// Admin home. Just a landing pad for now — links to the various admin
// surfaces. Will grow into a real dashboard summary as more domains land
// (Services E2-S4, Staff E2-S5, Bookings E3, etc).

export default function AdminHomePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Manage tenant-scoped resources. Backend at <code>api.wellos.one</code>.
      </p>
      <ul style={{ paddingLeft: '1.25rem', margin: 0, lineHeight: 1.8 }}>
        <li>
          <Link href="/admin/clients">Clients</Link> — create, edit, soft-delete client records.
        </li>
      </ul>
    </div>
  );
}
