import { Button } from '@/components/ui';
import { listClientTags } from '@/lib/api/client-tags';
import { type ClientWriteBody, type ClientWithTags } from '@/lib/api/clients';
import { StaffIcon, WarnIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import { ClientForm } from '../ClientForm';
import { deleteClientAction, updateClientAction } from '../_actions';
import { loadClientDetail } from './_data';
import { ClientTagsCard } from './_components/ClientTagsCard';
import { SectionHeader } from './_components/SectionHeader';
import { SectionSaveFooter } from './_components/SectionSaveFooter';

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

const OVERVIEW_FORM_ID = 'overview-client-form';

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
    <div className="flex flex-col gap-s6">
      {/* Contact & Profile card — wraps the existing ClientForm. The
          form's submit/reset is driven by the SectionSaveFooter below
          via the shared `OVERVIEW_FORM_ID`. */}
      <article
        className={cn(
          'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
        )}
      >
        <header className="border-b border-line/70 bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
          <SectionHeader
            icon={StaffIcon}
            eyebrow="CONTACT & PROFILE"
            headline="Keep contact info current."
            subtitle="Used for reminders, receipts, and appointment messaging. Changes save to this client only."
          />
        </header>
        <div className="p-s6 lg:p-s8 lg:pt-s6">
          <ClientForm
            id={OVERVIEW_FORM_ID}
            formClassName="max-w-none gap-s6"
            action={updateAction}
            initial={clientToFormDefaults(client)}
            tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            submitLabel="Save changes"
            successMessage="Client updated."
            hideInlineSubmit
          />
        </div>
        <SectionSaveFooter formId={OVERVIEW_FORM_ID} />
      </article>

      <ClientTagsCard
        clientId={client.id}
        currentTags={client.tags.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
        }))}
        allTags={tags.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
        }))}
      />

      {!client.deletedAt && (
        <section
          className={cn(
            'overflow-hidden rounded-md border border-red/30 bg-red-pale/40 shadow-sm',
          )}
        >
          <header className="border-b border-red/20 px-s6 py-s5 lg:px-s8 lg:py-s6">
            <SectionHeader
              tone="danger"
              icon={WarnIcon}
              eyebrow="DANGER ZONE"
              headline="Soft-delete this client."
              subtitle="Removes them from active lists. Past appointments remain visible."
            />
          </header>
          <div className="flex flex-wrap items-center justify-between gap-s4 p-s6 lg:p-s8">
            <p className="max-w-xl t-body-sm leading-relaxed text-ink-3">
              Soft-delete hides this profile from day-to-day workflows
              while preserving history. Restoration is a database admin
              task today.
            </p>
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
        </section>
      )}
    </div>
  );
}
