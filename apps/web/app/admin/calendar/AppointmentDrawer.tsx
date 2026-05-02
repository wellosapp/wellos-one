'use client';

import { useMemo } from 'react';

import { Badge, Drawer, Tabs, type TabItem } from '@/components/ui';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
import type { ClientWithTags } from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { AppointmentMediaResponse } from '@/lib/api/media';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import { formatDateTimeLocal, formatTimeLocal } from '@/lib/calendar';

import { AuditTab } from './tabs/AuditTab';
import { ClientTab } from './tabs/ClientTab';
import { FilesTab } from './tabs/FilesTab';
import { IntakeTab } from './tabs/IntakeTab';
import { NotesTab } from './tabs/NotesTab';
import { OverviewTab } from './tabs/OverviewTab';
import { PaymentTab } from './tabs/PaymentTab';

const TAB_KEYS = [
  'overview',
  'client',
  'payment',
  'intake',
  'files',
  'notes',
  'audit',
] as const;
type TabKey = (typeof TAB_KEYS)[number];

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

interface AppointmentDrawerProps {
  appointment: Appointment;
  client: ClientWithTags;
  notes: ClientNoteSummary[];
  bookingAnswers: BookingAnswer[];
  media: AppointmentMediaResponse;
  staff: Staff | null;
  service: Service | null;
  activeTab: string;
  dateParam: string;
  onClose: () => void;
}

export function AppointmentDrawer({
  appointment,
  client,
  notes,
  bookingAnswers,
  media,
  staff,
  service,
  activeTab,
  dateParam,
  onClose,
}: AppointmentDrawerProps) {
  const tab: TabKey = isTabKey(activeTab) ? activeTab : 'overview';

  const hrefForTab = useMemo(
    () => (key: string) => {
      const params = new URLSearchParams();
      params.set('date', dateParam);
      params.set('selected', appointment.id);
      if (key !== 'overview') params.set('tab', key);
      return `/admin/calendar?${params.toString()}`;
    },
    [appointment.id, dateParam],
  );

  const items: TabItem[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'client', label: 'Client' },
    { key: 'payment', label: 'Payment' },
    {
      key: 'intake',
      label: 'Intake',
      trailing:
        bookingAnswers.length > 0 ? (
          <Badge tone="accent">{bookingAnswers.length}</Badge>
        ) : null,
    },
    {
      key: 'files',
      label: 'Files',
      trailing: (() => {
        const total =
          media.referencePhotos.length +
          media.intakeDocs.length +
          media.consentDocs.length +
          media.receipts.length +
          media.generated.length;
        return total > 0 ? <Badge tone="accent">{total}</Badge> : null;
      })(),
    },
    {
      key: 'notes',
      label: 'Notes',
      trailing:
        notes.length > 0 ? <Badge tone="neutral">{notes.length}</Badge> : null,
    },
    { key: 'audit', label: 'Audit' },
  ];

  const clientName = `${client.firstName}${client.lastName ? ' ' + client.lastName : ''}`;

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Appointment details"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Appointment</span>
          <h2 className="t-display-md text-ink">{clientName}</h2>
        </div>
      }
      subtitle={
        <span>
          {formatDateTimeLocal(appointment.scheduledStartAt)} –{' '}
          {formatTimeLocal(appointment.scheduledEndAt)}
          {service ? ` · ${service.name}` : ''}
          {staff
            ? ` · ${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`
            : ''}
        </span>
      }
    >
      <div className="flex flex-col">
        <Tabs items={items} activeKey={tab} hrefForKey={hrefForTab} />

        <div className="px-s6 py-s5">
          {tab === 'overview' && (
            <OverviewTab
              appointment={appointment}
              client={client}
              service={service}
              staff={staff}
            />
          )}
          {tab === 'client' && <ClientTab client={client} />}
          {tab === 'payment' && <PaymentTab />}
          {tab === 'intake' && <IntakeTab answers={bookingAnswers} />}
          {tab === 'files' && (
            <FilesTab media={media} appointmentId={appointment.id} />
          )}
          {tab === 'notes' && (
            <NotesTab
              clientId={client.id}
              appointmentId={appointment.id}
              notes={notes}
            />
          )}
          {tab === 'audit' && <AuditTab appointment={appointment} />}
        </div>
      </div>
    </Drawer>
  );
}
