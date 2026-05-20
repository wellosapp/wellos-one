import { createHash, randomBytes } from 'node:crypto';

import {
  AppointmentStatus,
  type Appointment,
  type Client,
  type Location,
  type Service,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import { icsEscapeText, icsFoldLines, icsFormatUtcBasic } from '../lib/rfc5545.js';

export class StaffCalendarFeedStaffNotFoundError extends Error {
  constructor() {
    super('Staff not found for tenant');
    this.name = 'StaffCalendarFeedStaffNotFoundError';
  }
}

export function hashStaffCalendarFeedToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateStaffCalendarFeedRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export function buildStaffCalendarSubscribeUrl(rawToken: string): string {
  const base = (process.env.API_URL ?? '').replace(/\/+$/, '');
  if (!base) {
    return `/public/calendar/staff.ics?token=${encodeURIComponent(rawToken)}`;
  }
  return `${base}/public/calendar/staff.ics?token=${encodeURIComponent(rawToken)}`;
}

export async function regenerateStaffCalendarFeedToken(
  prisma: ExtendedPrismaClient,
  params: { tenantId: string; staffId: string },
): Promise<{ rawToken: string; subscribeUrl: string }> {
  const staff = await prisma.staff.findFirst({
    where: { id: params.staffId, tenantId: params.tenantId, deletedAt: null },
    select: { id: true, tenantId: true },
  });

  if (!staff) {
    throw new StaffCalendarFeedStaffNotFoundError();
  }

  const rawToken = generateStaffCalendarFeedRawToken();
  const tokenHash = hashStaffCalendarFeedToken(rawToken);

  await prisma.$transaction([
    prisma.staffCalendarFeedToken.deleteMany({
      where: { staffId: staff.id, tenantId: staff.tenantId },
    }),
    prisma.staffCalendarFeedToken.create({
      data: {
        tenantId: staff.tenantId,
        staffId: staff.id,
        tokenHash,
      },
    }),
  ]);

  return {
    rawToken,
    subscribeUrl: buildStaffCalendarSubscribeUrl(rawToken),
  };
}

type AppointmentForIcs = Appointment & {
  client: Pick<Client, 'firstName' | 'lastName'>;
  service: Pick<Service, 'name'>;
  location: Pick<Location, 'name'>;
};

function buildClientLabel(client: Pick<Client, 'firstName' | 'lastName'>): string {
  const parts = [client.firstName, client.lastName].filter(Boolean);
  return parts.join(' ').trim() || 'Client';
}

export function buildStaffAppointmentsIcsCalendar(params: {
  staffDisplayName: string;
  appointments: AppointmentForIcs[];
  calendarIssuedAt: Date;
}): string {
  const dtStamp = icsFormatUtcBasic(params.calendarIssuedAt);
  const headerLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wellos//Staff ICS Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscapeText(`${params.staffDisplayName} — Wellos`)}`,
  ];

  const eventLines: string[] = [];

  for (const appt of params.appointments) {
    const uid = `${appt.id}@calendar.wellos.one`;
    const summary = `${buildClientLabel(appt.client)} — ${appt.service.name}`;
    const descriptionParts = [
      `Service: ${appt.service.name}`,
      `Client: ${buildClientLabel(appt.client)}`,
      `Location: ${appt.location.name}`,
      `Status: ${appt.state}`,
    ];
    if (appt.notes?.trim()) {
      descriptionParts.push(`Notes: ${appt.notes.trim()}`);
    }
    const description = descriptionParts.join('\n');

    eventLines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${icsFormatUtcBasic(appt.scheduledStartAt)}`,
      `DTEND:${icsFormatUtcBasic(appt.scheduledEndAt)}`,
      `SUMMARY:${icsEscapeText(summary)}`,
      `DESCRIPTION:${icsEscapeText(description)}`,
      `LOCATION:${icsEscapeText(appt.location.name)}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT',
    );
  }

  const closers = ['END:VCALENDAR'];
  const folded = icsFoldLines([...headerLines, ...eventLines, ...closers]);
  return `${folded.join('\r\n')}\r\n`;
}

export async function loadStaffIcsAppointments(
  prisma: ExtendedPrismaClient,
  params: { tenantId: string; staffId: string },
): Promise<{ staffLabel: string; appointments: AppointmentForIcs[] }> {
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 365);

  const staff = await prisma.staff.findFirst({
    where: { id: params.staffId, tenantId: params.tenantId, deletedAt: null },
    select: { firstName: true, lastName: true },
  });

  if (!staff) {
    throw new StaffCalendarFeedStaffNotFoundError();
  }

  const staffLabel = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim() || 'Staff';

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      deletedAt: null,
      state: {
        notIn: [AppointmentStatus.cancelled, AppointmentStatus.no_show],
      },
      scheduledStartAt: { lt: windowEnd },
      scheduledEndAt: { gt: windowStart },
    },
    orderBy: { scheduledStartAt: 'asc' },
    include: {
      client: { select: { firstName: true, lastName: true } },
      service: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  return { staffLabel, appointments };
}
