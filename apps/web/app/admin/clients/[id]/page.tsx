import { Button, Card } from '@/components/ui';
import { listClientTags } from '@/lib/api/client-tags';
import { type ClientWriteBody, type ClientWithTags } from '@/lib/api/clients';

import { ClientForm } from '../ClientForm';
import { deleteClientAction, updateClientAction } from '../_actions';
import { loadClientDetail } from './_data';

function clientToFormDefaults(c: ClientWithTags): Partial<ClientWriteBody> {
  return {
    firstName: c.firstName,
    lastName: c.lastName ?? undefined,
    preferredName: c.preferredName ?? undefined,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
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

  const client = await loadClientDetail(id);
  const { tags } = await listClientTags({ take: 200 });

  const updateAction = updateClientAction.bind(null, id);
  const deleteAction = deleteClientAction.bind(null, id);

  return (
    <section className="flex flex-col gap-s6">
      <article className="overflow-hidden rounded-2xl border border-surface-3 bg-white shadow-sm">
        <header className="border-b border-surface-3 bg-surface/50 px-s6 py-s5 lg:px-s8 lg:py-s6">
          <h2 className="font-display t-display-sm text-ink">
            Contact and profile
          </h2>
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-soft">
            Keep contact info current for reminders and receipts. Changes save
            to this client only.
          </p>
        </header>
        <div className="p-s6 lg:p-s8 lg:pt-s7">
          <ClientForm
            formClassName="max-w-none gap-s6"
            action={updateAction}
            initial={clientToFormDefaults(client)}
            tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            submitLabel="Save changes"
            successMessage="Client updated."
          />
        </div>
      </article>

      {!client.deletedAt && (
        <Card
          padding="lg"
          className="rounded-2xl border border-red/25 bg-red-pale/35 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex max-w-xl flex-col gap-s1">
              <h2 className="font-display t-display-sm text-ink">
                Remove from active lists
              </h2>
              <p className="t-body-sm leading-relaxed text-ink-soft">
                Soft-delete hides this profile from day-to-day workflows while
                preserving history. Restoration is a database admin task today.
              </p>
            </div>
            <form action={deleteAction}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="whitespace-nowrap text-red hover:bg-red-pale"
              >
                Soft-delete client
              </Button>
            </form>
          </div>
        </Card>
      )}
    </section>
  );
}
