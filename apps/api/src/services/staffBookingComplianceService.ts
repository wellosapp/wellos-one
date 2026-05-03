import { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import {
  getStaffBookingClientContext,
  staffBookingFormsRequiringBookingAckWire,
} from './staffBookingClientContextService.js';

export class StaffBookingComplianceError extends Error {
  code = 'STAFF_BOOKING_COMPLIANCE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'StaffBookingComplianceError';
  }
}

/**
 * Persists an audit row when the operator acknowledged required forms
 * (required_before_booking / required_before_visit) during Quick Book.
 * Server validates that the client+service context still lists such forms.
 */
export async function logRequiredFormsBookingAcknowledgment(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    staffId: string;
    clientId: string;
    serviceId: string;
  },
): Promise<void> {
  const { tenantId, actorUserId, appointmentId, staffId, clientId, serviceId } =
    args;

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true, clientId: true, serviceId: true, staffId: true },
  });
  if (!appt) {
    throw new StaffBookingComplianceError('Appointment not found.');
  }
  if (appt.clientId !== clientId) {
    throw new StaffBookingComplianceError(
      'Appointment does not belong to this client.',
    );
  }
  if (appt.serviceId !== serviceId || appt.staffId !== staffId) {
    throw new StaffBookingComplianceError(
      'Appointment does not match booking context.',
    );
  }

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId },
    select: { id: true },
  });
  if (!staff) {
    throw new StaffBookingComplianceError('Unknown staff for this tenant.');
  }

  const ctx = await getStaffBookingClientContext(prisma, {
    tenantId,
    clientId,
    serviceId,
    staffId,
  });
  if (!ctx) {
    throw new StaffBookingComplianceError('Client not found for tenant.');
  }

  const formsNeeding = staffBookingFormsRequiringBookingAckWire(ctx);
  if (formsNeeding.length === 0) {
    throw new StaffBookingComplianceError(
      'No forms currently require a booking acknowledgment.',
    );
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      actorType: 'user',
      action: 'staff_booking.required_forms_acknowledged',
      entityType: 'appointment',
      entityId: appointmentId,
      before: Prisma.JsonNull,
      after: {
        clientId,
        staffId,
        serviceId,
        formIds: formsNeeding.map((f) => f.id),
        formLabels: formsNeeding.map((f) => f.label),
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
