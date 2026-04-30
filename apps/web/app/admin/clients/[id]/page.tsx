import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listClientTags } from '@/lib/api/client-tags';
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
    tagIds: c.tagIds,
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

  const { tags } = await listClientTags({ take: 200 });

  const updateAction = updateClientAction.bind(null, id);
  const deleteAction = deleteClientAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/clients"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to clients
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Client</span>
          <h1 className="t-display-lg">
            {client.firstName}
            {client.lastName ? ` ${client.lastName}` : ''}
          </h1>
        </div>
        {client.deletedAt && (
          <Badge tone="red">
            Soft-deleted {new Date(client.deletedAt).toLocaleString()}
          </Badge>
        )}
      </header>

      <Card padding="lg">
        <ClientForm
          action={updateAction}
          initial={clientToFormDefaults(client)}
          tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          submitLabel="Save changes"
          successMessage="Client updated."
        />
      </Card>

      {!client.deletedAt && (
        <Card padding="md" className="border border-red/20 bg-red-pale/40">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete client</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from lists but keeps history. Reversible by an admin via DB.
              </p>
            </div>
            <form action={deleteAction}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="text-red hover:bg-red-pale"
              >
                Soft-delete
              </Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
