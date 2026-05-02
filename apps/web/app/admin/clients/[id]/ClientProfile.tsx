'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { Alert, Tabs, type TabItem } from '@/components/ui';
import type {
  ClientMediaResponse,
  ClientStats,
  ClientTagSummary,
  ClientWithTags,
  ClientWriteBody,
} from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { ClientTimelineResponse } from '@/lib/api/timeline';

import { updateClientAction } from '../_actions';
import { ClientHeaderCard } from './ClientHeaderCard';
import { ProfileEditDrawer } from './ProfileEditDrawer';
import { ActivityTab } from './tabs/ActivityTab';
import { FilesTab } from './tabs/FilesTab';
import { IntakeTab } from './tabs/IntakeTab';
import { NotesTab } from './tabs/NotesTab';
import { OverviewTab } from './tabs/OverviewTab';
import { VisitsTab } from './tabs/VisitsTab';

const TAB_KEYS = [
  'overview',
  'visits',
  'notes',
  'files',
  'intake',
  'activity',
] as const;
type TabKey = (typeof TAB_KEYS)[number];

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

interface ClientProfileProps {
  client: ClientWithTags;
  tags: ClientTagSummary[];
  stats: ClientStats;
  media: ClientMediaResponse;
  timeline: ClientTimelineResponse;
  allNotes: ClientNoteSummary[];
  activeTab: string;
  editOpen: boolean;
}

function clientToFormDefaults(c: ClientWithTags): Partial<ClientWriteBody> {
  return {
    firstName: c.firstName,
    lastName: c.lastName ?? undefined,
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

export function ClientProfile({
  client,
  tags,
  stats,
  media,
  timeline,
  allNotes,
  activeTab,
  editOpen,
}: ClientProfileProps) {
  const router = useRouter();
  const tab: TabKey = isTabKey(activeTab) ? activeTab : 'overview';

  const hrefForTab = useCallback(
    (key: string): string => {
      const params = new URLSearchParams();
      if (key !== 'overview') params.set('tab', key);
      const qs = params.toString();
      return qs
        ? `/admin/clients/${client.id}?${qs}`
        : `/admin/clients/${client.id}`;
    },
    [client.id],
  );

  const hrefEditOpen = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== 'overview') params.set('tab', tab);
    params.set('edit', '1');
    return `/admin/clients/${client.id}?${params.toString()}`;
  }, [client.id, tab]);

  const hrefEditClose = useMemo(() => {
    const params = new URLSearchParams();
    if (tab !== 'overview') params.set('tab', tab);
    const qs = params.toString();
    return qs
      ? `/admin/clients/${client.id}?${qs}`
      : `/admin/clients/${client.id}`;
  }, [client.id, tab]);

  const handleCloseEdit = useCallback(() => {
    router.push(hrefEditClose as Route);
  }, [router, hrefEditClose]);

  const totalFilesCount =
    media.referencePhotos.length +
    media.intakeDocs.length +
    media.consentDocs.length +
    media.receipts.length +
    media.generated.length;

  // Build the booking-answer feed across visits for the Intake tab.
  const allBookingAnswers = useMemo(
    () => timeline.visits.flatMap((v) => v.bookingAnswers),
    [timeline.visits],
  );

  const items: TabItem[] = [
    {
      key: 'overview',
      label: 'Overview',
    },
    {
      key: 'visits',
      label: 'Visits',
      trailing: stats.totalVisits > 0 ? `${stats.totalVisits}` : null,
    },
    {
      key: 'notes',
      label: 'Notes',
      trailing: allNotes.length > 0 ? `${allNotes.length}` : null,
    },
    {
      key: 'files',
      label: 'Files',
      trailing: totalFilesCount > 0 ? `${totalFilesCount}` : null,
    },
    {
      key: 'intake',
      label: 'Intake',
      trailing:
        allBookingAnswers.length > 0 ? `${allBookingAnswers.length}` : null,
    },
    {
      key: 'activity',
      label: 'Activity',
    },
  ];

  return (
    <div className="flex flex-col gap-s5">
      {client.deletedAt && (
        <Alert tone="warning">
          This client is soft-deleted ({new Date(client.deletedAt).toLocaleString()}).
          They are hidden from booking and lists.
        </Alert>
      )}

      <ClientHeaderCard
        client={client}
        stats={stats}
        editHref={hrefEditOpen}
      />

      <div className="rounded-md border border-surface-3 bg-white shadow-sm">
        <Tabs items={items} activeKey={tab} hrefForKey={hrefForTab} />

        <div className="px-s6 py-s5">
          {tab === 'overview' && (
            <OverviewTab
              client={client}
              stats={stats}
              timeline={timeline}
              allNotes={allNotes}
              editHref={hrefEditOpen}
            />
          )}
          {tab === 'visits' && <VisitsTab timeline={timeline} clientId={client.id} />}
          {tab === 'notes' && (
            <NotesTab clientId={client.id} notes={allNotes} />
          )}
          {tab === 'files' && (
            <FilesTab media={media} clientId={client.id} />
          )}
          {tab === 'intake' && (
            <IntakeTab visits={timeline.visits} clientId={client.id} />
          )}
          {tab === 'activity' && (
            <ActivityTab client={client} stats={stats} />
          )}
        </div>
      </div>

      {editOpen && (
        <ProfileEditDrawer
          clientId={client.id}
          initial={clientToFormDefaults(client)}
          tags={tags}
          updateAction={updateClientAction.bind(null, client.id)}
          onClose={handleCloseEdit}
        />
      )}
    </div>
  );
}
