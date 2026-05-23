import { Button } from '@/components/ui';
import { listClientTags } from '@/lib/api/client-tags';
import { type ClientWriteBody, type ClientWithTags } from '@/lib/api/clients';

import { WarnIcon } from '@/app/admin/_shell/icons';

import { ClientForm } from '../ClientForm';
import { deleteClientAction, updateClientAction } from '../_actions';
import { ClientTagsCard } from './_components/ClientTagsCard';
import { SectionHeader } from './_components/SectionHeader';
import { loadClientDetail } from './_data';

const OVERVIEW_FORM_ID = 'overview-client-form';

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
  const { tags: allTags } = await listClientTags({ take: 200 });

  const updateAction = updateClientAction.bind(null, id);
  const deleteAction = deleteClientAction.bind(null, id);

  const formDefaults = clientToFormDefaults(client);

  return (
    <div className="flex flex-col gap-s6">
      <ClientForm
        id={OVERVIEW_FORM_ID}
        formClassName="max-w-none gap-s6"
        action={updateAction}
        initial={formDefaults}
        tags={allTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        submitLabel="Save changes"
        successMessage="Client updated."
        hideInlineSubmit
        hideTagsFieldset
      />

      <ClientTagsCard
        clientId={client.id}
        currentTags={client.tags.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
        }))}
        allTags={allTags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        clientSnapshot={formDefaults}
      />

      {!client.deletedAt && (
        <SectionHeader
          icon={WarnIcon}
          eyebrow="DANGER ZONE"
          headline="Soft-delete this client."
          subtitle="Removes them from active lists. Past appointments remain visible."
          tone="danger"
        >
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex max-w-xl flex-col gap-s1">
              <h3 className="font-display text-[18px] text-ink">
                Remove from active lists
              </h3>
              <p className="t-body-sm leading-relaxed text-ink-3">
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
        </SectionHeader>
      )}
    </div>
  );
}

