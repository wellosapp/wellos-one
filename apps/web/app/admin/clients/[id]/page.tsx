import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getClient, type ClientWriteBody } from '@/lib/api/clients';

import { ClientForm } from '../ClientForm';
import { deleteClientAction, updateClientAction } from '../_actions';

function clientToFormDefaults(c: Awaited<ReturnType<typeof getClient>>['client']): Partial<ClientWriteBody> {
  return {
    firstName: c.firstName,
    lastName: c.lastName ?? undefined,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    // c.dateOfBirth is an ISO datetime; the date input wants YYYY-MM-DD.
    dateOfBirth: c.dateOfBirth ? c.dateOfBirth.slice(0, 10) : undefined,
    addressLine1: c.addressLine1 ?? undefined,
    addressLine2: c.addressLine2 ?? undefined,
    city: c.city ?? undefined,
    state: c.state ?? undefined,
    postalCode: c.postalCode ?? undefined,
    country: c.country ?? undefined,
    emergencyContactName: c.emergencyContactName ?? undefined,
    emergencyContactPhone: c.emergencyContactPhone ?? undefined,
    intakeStatus: c.intakeStatus,
    notes: c.notes ?? undefined,
  };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client;
  try {
    const result = await getClient(id);
    client = result.client;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const updateAction = updateClientAction.bind(null, id);
  const deleteAction = deleteClientAction.bind(null, id);

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

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>
          {client.firstName}
          {client.lastName ? ` ${client.lastName}` : ''}
        </h1>
        {client.deletedAt && (
          <span
            style={{
              padding: '0.25rem 0.5rem',
              background: '#fee',
              border: '1px solid #c33',
              borderRadius: '4px',
              color: '#900',
              fontSize: '0.85rem',
            }}
          >
            Soft-deleted {new Date(client.deletedAt).toLocaleString()}
          </span>
        )}
      </div>

      <ClientForm
        action={updateAction}
        initial={clientToFormDefaults(client)}
        submitLabel="Save changes"
        successMessage="Client updated."
      />

      {!client.deletedAt && (
        <form action={deleteAction} style={{ marginTop: '2rem' }}>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              color: '#c33',
              border: '1px solid #c33',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Soft-delete client
          </button>
          <span style={{ marginLeft: '0.75rem', color: '#666', fontSize: '0.85rem' }}>
            Hides from lists but keeps history. Reversible by an admin via DB.
          </span>
        </form>
      )}
    </div>
  );
}
