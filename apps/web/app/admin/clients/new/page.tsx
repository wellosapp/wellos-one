import Link from 'next/link';

import { ClientForm } from '../ClientForm';
import { createClientAction } from '../_actions';

export default function NewClientPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <Link
          href="/admin/clients"
          style={{ color: '#1a5cff', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← Back to clients
        </Link>
      </div>
      <h1 style={{ margin: 0 }}>New client</h1>
      <ClientForm action={createClientAction} submitLabel="Create client" />
    </div>
  );
}
