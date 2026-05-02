'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { Badge, Button, Card } from '@/components/ui';
import type { ClientWithTags } from '@/lib/api/clients';

interface ClientTabProps {
  client: ClientWithTags;
}

export function ClientTab({ client }: ClientTabProps) {
  const fullName = `${client.firstName}${client.lastName ? ' ' + client.lastName : ''}`;

  return (
    <div className="flex flex-col gap-s5">
      {/* Banned + opted-out flags get prominent surfacing — these change how
          you treat the client during the visit. */}
      {(client.banned || client.notes) && (
        <div className="flex flex-col gap-s2">
          {client.banned && (
            <div className="rounded-md border border-red/30 bg-red-pale/40 p-s3">
              <span className="t-body-sm font-medium text-red">
                Banned{client.notes ? ` — see notes` : ''}.
              </span>
            </div>
          )}
        </div>
      )}

      <Card padding="md" className="border border-surface-3">
        <div className="flex flex-col gap-s3">
          <div className="flex items-baseline justify-between gap-s3">
            <h3 className="t-display-sm text-ink">{fullName}</h3>
            {client.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-s1">
                {client.tags.map((t) => (
                  <Badge key={t.id} tone="accent">
                    {t.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Phone</dt>
              <dd className="t-body-md text-ink">{client.phone ?? '—'}</dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Email</dt>
              <dd className="t-body-md text-ink break-all">{client.email ?? '—'}</dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Intake status</dt>
              <dd className="t-body-md text-ink">{client.intakeStatus}</dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Emergency contact</dt>
              <dd className="t-body-md text-ink">
                {client.emergencyContactName
                  ? `${client.emergencyContactName}${client.emergencyContactPhone ? ' · ' + client.emergencyContactPhone : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>

          {client.notes && (
            <div className="flex flex-col gap-s1 border-t border-surface-3 pt-s3">
              <span className="t-caption text-ink-soft">Profile notes</span>
              <p className="t-body-md whitespace-pre-wrap text-ink">
                {client.notes}
              </p>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-s2">
        <Link
          href={`/admin/clients/${client.id}` as Route}
          className="no-underline"
        >
          <Button variant="ghost" size="sm">
            Open profile →
          </Button>
        </Link>
        <Link
          href={`/admin/clients/${client.id}/timeline` as Route}
          className="no-underline"
        >
          <Button variant="ghost" size="sm">
            View visit timeline →
          </Button>
        </Link>
      </div>
    </div>
  );
}
