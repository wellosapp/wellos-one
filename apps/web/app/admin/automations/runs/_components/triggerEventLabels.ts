// Human-readable labels for AutomationEventType values. Mirrors the union
// in apps/api/src/lib/automationEventBus.ts. When that union grows, add
// the corresponding label here.
//
// Used in: trigger pills (list + detail), timeline labels, and the run-
// context sidebar.

export const TRIGGER_EVENT_LABELS: Record<string, string> = {
  // Booking
  'booking.appointment.created': 'Appointment booked',
  'booking.appointment.confirmed': 'Appointment confirmed',
  'booking.appointment.rescheduled': 'Appointment rescheduled',
  'booking.appointment.cancelled': 'Appointment cancelled',
  'booking.appointment.checked_in': 'Appointment checked in',
  'booking.appointment.checked_out': 'Appointment checked out',
  'booking.appointment.completed': 'Appointment completed',
  'booking.appointment.no_show': 'Appointment no-show',
  'booking.waitlist.joined': 'Waitlist joined',
  'booking.waitlist.promoted': 'Waitlist promoted',
  // Client
  'client.created': 'Client created',
  'client.updated': 'Client updated',
  'client.tagged': 'Client tagged',
  'client.birthday': 'Client birthday',
  'client.inactive': 'Client inactive',
  'client.milestone.visits': 'Visit milestone',
  'client.milestone.spend': 'Spend milestone',
  'client.status_changed': 'Client status changed',
  'client.banned': 'Client banned',
  // Forms
  'form.assigned': 'Form assigned',
  'form.sent': 'Form sent',
  'form.opened': 'Form opened',
  'form.started': 'Form started',
  'form.submitted': 'Form submitted',
  'form.completed': 'Form completed',
  'form.expired': 'Form expired',
  'form.requires_review': 'Form requires review',
  'form.approved': 'Form approved',
  'form.denied': 'Form denied',
  // Payment
  'payment.succeeded': 'Payment succeeded',
  'payment.failed': 'Payment failed',
  'payment.refunded': 'Payment refunded',
  'payment.outstanding_balance_created': 'Outstanding balance created',
  'payment.deposit_paid': 'Deposit paid',
  'payment.invoice_sent': 'Invoice sent',
  'payment.invoice_overdue': 'Invoice overdue',
  // Membership / package
  'membership.created': 'Membership created',
  'membership.renewed': 'Membership renewed',
  'membership.cancelled': 'Membership cancelled',
  'membership.payment_failed': 'Membership payment failed',
  'package.purchased': 'Package purchased',
  'package.low_balance': 'Package low balance',
  'package.expired': 'Package expired',
  // Notes / alerts
  'note.created': 'Note created',
  'alert.created': 'Alert created',
  'alert.acknowledged': 'Alert acknowledged',
  'alert.allergy_created': 'Allergy alert created',
  'alert.behavioral_created': 'Behavioral alert created',
  // SOAP / clinical
  'soap.note_created': 'SOAP note created',
  'soap.note_locked': 'SOAP note locked',
  'soap.note_revised': 'SOAP note revised',
  'clinical.form_submitted': 'Clinical form submitted',
  'clinical.image_uploaded': 'Clinical image uploaded',
  // Files
  'file.uploaded': 'File uploaded',
  'file.before_after_uploaded': 'Before/after photo uploaded',
  'file.protected_uploaded': 'Protected file uploaded',
  'file.client_reference_uploaded': 'Client reference uploaded',
  // Staff
  'staff.invited': 'Staff invited',
  'staff.activated': 'Staff activated',
  'staff.onboarding_incomplete': 'Staff onboarding incomplete',
  'staff.certification_expiring': 'Staff certification expiring',
  'staff.schedule_updated': 'Staff schedule updated',
};

export function triggerEventLabel(type: string): string {
  return TRIGGER_EVENT_LABELS[type] ?? type;
}
