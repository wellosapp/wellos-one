// Trigger types grouped by category for the "+ New automation" modal.
// Mirrors the AutomationEventType union in
// apps/api/src/lib/automationEventBus.ts. When the union grows, add the new
// values to the right group.
//
// Payment + Membership groups carry `disabled: true` until Epic 6 + a
// memberships epic ship — they appear with a "Coming soon" hint so users
// see the future surface but can't pick a type with no publisher yet.

import { triggerEventLabel } from '../runs/_components/triggerEventLabels';

export interface TriggerEventChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TriggerEventGroup {
  label: string;
  /** When true, all choices in the group render disabled with a coming-soon hint. */
  comingSoon?: boolean;
  choices: TriggerEventChoice[];
}

function group(
  label: string,
  values: string[],
  opts: { comingSoon?: boolean } = {},
): TriggerEventGroup {
  return {
    label,
    comingSoon: opts.comingSoon,
    choices: values.map((v) => ({
      value: v,
      label: triggerEventLabel(v),
      disabled: opts.comingSoon,
    })),
  };
}

export const TRIGGER_EVENT_GROUPS: TriggerEventGroup[] = [
  group('Booking', [
    'booking.appointment.created',
    'booking.appointment.confirmed',
    'booking.appointment.rescheduled',
    'booking.appointment.cancelled',
    'booking.appointment.checked_in',
    'booking.appointment.checked_out',
    'booking.appointment.completed',
    'booking.appointment.no_show',
    'booking.waitlist.joined',
    'booking.waitlist.promoted',
  ]),
  group('Client', [
    'client.created',
    'client.updated',
    'client.tagged',
    'client.birthday',
    'client.inactive',
    'client.milestone.visits',
    'client.milestone.spend',
    'client.status_changed',
    'client.banned',
  ]),
  group('Forms', [
    'form.assigned',
    'form.sent',
    'form.opened',
    'form.started',
    'form.submitted',
    'form.completed',
    'form.expired',
    'form.requires_review',
    'form.approved',
    'form.denied',
  ]),
  group(
    'Payment',
    [
      'payment.succeeded',
      'payment.failed',
      'payment.refunded',
      'payment.outstanding_balance_created',
      'payment.deposit_paid',
      'payment.invoice_sent',
      'payment.invoice_overdue',
    ],
    { comingSoon: true },
  ),
  group(
    'Membership',
    [
      'membership.created',
      'membership.renewed',
      'membership.cancelled',
      'membership.payment_failed',
      'package.purchased',
      'package.low_balance',
      'package.expired',
    ],
    { comingSoon: true },
  ),
  group('Notes & alerts', [
    'note.created',
    'alert.created',
    'alert.acknowledged',
    'alert.allergy_created',
    'alert.behavioral_created',
  ]),
  group('Clinical', [
    'soap.note_created',
    'soap.note_locked',
    'soap.note_revised',
    'clinical.form_submitted',
    'clinical.image_uploaded',
  ]),
  group('Files', [
    'file.uploaded',
    'file.before_after_uploaded',
    'file.protected_uploaded',
    'file.client_reference_uploaded',
  ]),
  group('Staff', [
    'staff.invited',
    'staff.activated',
    'staff.onboarding_incomplete',
    'staff.certification_expiring',
    'staff.schedule_updated',
  ]),
];
