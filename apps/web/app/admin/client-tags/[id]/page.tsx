import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getClientTag, type ClientTag } from '@/lib/api/client-tags';

import { ClientTagForm } from '../ClientTagForm';
import type { ClientTagFormValues } from '../_actions';
import { deleteClientTagAction, updateClientTagAction } from '../_actions';

function tagToFormDefaults(t: ClientTag): ClientTagFormValues {
  return {
    name: t.name,
    color: t.color ?? undefined,
  };
}

export default async function ClientTagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let tag: ClientTag;
  try {
    const result = await getClientTag(id);
    tag = result.tag;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const updateAction = updateClientTagAction.bind(null, id);
  const deleteAction = deleteClientTagAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/client-tags"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to tags
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Tag</span>
          <h1 className="t-display-lg">{tag.name}</h1>
        </div>
        {tag.deletedAt ? (
          <Badge tone="red">
            Soft-deleted {new Date(tag.deletedAt).toLocaleString()}
          </Badge>
        ) : (
          <Badge tone="green">Active</Badge>
        )}
      </header>

      <Card padding="lg">
        <ClientTagForm
          action={updateAction}
          initial={tagToFormDefaults(tag)}
          submitLabel="Save changes"
          successMessage="Tag updated."
        />
      </Card>

      {!tag.deletedAt && (
        <Card padding="md" className="border border-red/20 bg-red-pale/40">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete tag</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from pickers and badges; existing client assignments are
                preserved for the audit trail. Reversible by an admin via DB.
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
