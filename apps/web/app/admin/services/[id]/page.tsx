import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getService } from '@/lib/api/services';

import { ServiceForm } from '../ServiceForm';
import type { ServiceFormValues } from '../_actions';
import { deleteServiceAction, updateServiceAction } from '../_actions';

function serviceToFormDefaults(
  s: Awaited<ReturnType<typeof getService>>['service'],
): ServiceFormValues {
  return {
    name: s.name,
    description: s.description ?? undefined,
    durationMinutes: String(s.durationMinutes),
    basePriceDollars: (s.basePriceCents / 100).toFixed(2),
    color: s.color ?? undefined,
    active: s.active,
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let service;
  try {
    const result = await getService(id);
    service = result.service;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const updateAction = updateServiceAction.bind(null, id);
  const deleteAction = deleteServiceAction.bind(null, id);

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/services"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to services
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Service</span>
          <h1 className="t-display-lg">{service.name}</h1>
        </div>
        {service.deletedAt ? (
          <Badge tone="red">
            Soft-deleted {new Date(service.deletedAt).toLocaleString()}
          </Badge>
        ) : service.active ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
      </header>

      <Card padding="lg">
        <ServiceForm
          action={updateAction}
          initial={serviceToFormDefaults(service)}
          submitLabel="Save changes"
          successMessage="Service updated."
        />
      </Card>

      {!service.deletedAt && (
        <Card padding="md" className="border border-red/20 bg-red-pale/40">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete service</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from booking and lists but keeps history. Reversible by an admin via DB.
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
