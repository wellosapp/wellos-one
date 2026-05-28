// Field catalog for condition rules + variable picker. PR 8 of the
// Automation System epic.
//
// Mirrors the shape produced by
// apps/api/src/services/automationContextEnricher.ts. The enricher branches
// on the event-type prefix (booking.* / client.* / form.* / etc.) and
// loads different sub-objects on the run context. This catalog enumerates
// the dotted paths each branch exposes so users can pick fields without
// guessing.
//
// Common fields (event.*, tenant.*, workflow.*) are always available
// regardless of trigger. Branch-specific fields layer on top.
//
// Future-proofing: when PRs 11-13 wire more publishers (and the enricher
// gains richer loaders), add fields to the matching branch group below.

import type { FieldKind } from './conditionOperators';

export interface FieldDef {
  /** Dotted path passed to resolveFieldPath at runtime. */
  path: string;
  label: string;
  kind: FieldKind;
  /** Short hint shown next to the field in the picker. */
  hint?: string;
}

export interface FieldGroup {
  label: string;
  fields: FieldDef[];
}

// ---- Common fields (always available) ----

const COMMON_FIELDS: FieldGroup = {
  label: 'Event',
  fields: [
    { path: 'event.type', label: 'Event type', kind: 'string' },
    { path: 'event.timestamp', label: 'Event timestamp', kind: 'date' },
    { path: 'tenant.id', label: 'Tenant id', kind: 'string' },
    { path: 'tenant.slug', label: 'Tenant slug', kind: 'string' },
    { path: 'workflow.id', label: 'Workflow id', kind: 'string' },
    { path: 'workflow.name', label: 'Workflow name', kind: 'string' },
  ],
};

// ---- Per-branch fields ----

const CLIENT_FIELDS: FieldGroup = {
  label: 'Client',
  fields: [
    { path: 'client.id', label: 'Client id', kind: 'string' },
    { path: 'client.firstName', label: 'First name', kind: 'string' },
    { path: 'client.lastName', label: 'Last name', kind: 'string' },
    { path: 'client.email', label: 'Email', kind: 'string' },
    { path: 'client.phone', label: 'Phone', kind: 'string' },
    { path: 'client.tags', label: 'Tags', kind: 'array' },
    { path: 'client.dateOfBirth', label: 'Date of birth', kind: 'date' },
    { path: 'client.smsOptedOut', label: 'SMS opted out', kind: 'boolean' },
    { path: 'client.emailOptedOut', label: 'Email opted out', kind: 'boolean' },
    { path: 'client.preferredChannel', label: 'Preferred channel', kind: 'string' },
    { path: 'client.banned', label: 'Banned', kind: 'boolean' },
    { path: 'client.intakeStatus', label: 'Intake status', kind: 'string' },
    { path: 'client.clientNumber', label: 'Client number', kind: 'number' },
  ],
};

const APPOINTMENT_FIELDS: FieldGroup = {
  label: 'Appointment',
  fields: [
    { path: 'appointment.id', label: 'Appointment id', kind: 'string' },
    { path: 'appointment.state', label: 'State', kind: 'string' },
    { path: 'appointment.source', label: 'Source', kind: 'string' },
    { path: 'appointment.scheduledStartAt', label: 'Start time', kind: 'date' },
    { path: 'appointment.scheduledEndAt', label: 'End time', kind: 'date' },
    { path: 'appointment.serviceId', label: 'Service id', kind: 'string' },
    { path: 'appointment.staffId', label: 'Staff id', kind: 'string' },
    { path: 'appointment.locationId', label: 'Location id', kind: 'string' },
    { path: 'appointment.bookedBasePriceCents', label: 'Price (cents)', kind: 'number' },
  ],
};

const SERVICE_FIELDS: FieldGroup = {
  label: 'Service',
  fields: [
    { path: 'service.id', label: 'Service id', kind: 'string' },
    { path: 'service.name', label: 'Service name', kind: 'string' },
    { path: 'service.durationMinutes', label: 'Duration (min)', kind: 'number' },
    { path: 'service.basePriceCents', label: 'Base price (cents)', kind: 'number' },
    { path: 'service.categoryId', label: 'Category id', kind: 'string' },
    { path: 'service.active', label: 'Active', kind: 'boolean' },
  ],
};

const PROVIDER_FIELDS: FieldGroup = {
  label: 'Provider',
  fields: [
    { path: 'provider.id', label: 'Provider id', kind: 'string' },
    { path: 'provider.firstName', label: 'First name', kind: 'string' },
    { path: 'provider.lastName', label: 'Last name', kind: 'string' },
    { path: 'provider.jobTitle', label: 'Job title', kind: 'string' },
    { path: 'provider.active', label: 'Active', kind: 'boolean' },
  ],
};

const CLASS_BOOKING_FIELDS: FieldGroup = {
  label: 'Class booking',
  fields: [
    { path: 'classBooking.id', label: 'Booking id', kind: 'string' },
    { path: 'classBooking.state', label: 'State', kind: 'string' },
    { path: 'classBooking.late', label: 'Late', kind: 'boolean' },
    { path: 'classBooking.checkedInAt', label: 'Checked in at', kind: 'date' },
    { path: 'classBooking.classInstance.classId', label: 'Class id', kind: 'string' },
    { path: 'classBooking.classInstance.scheduledStartAt', label: 'Class start', kind: 'date' },
    { path: 'classBooking.classInstance.class.name', label: 'Class name', kind: 'string' },
  ],
};

const SUBMISSION_FIELDS: FieldGroup = {
  label: 'Form submission',
  fields: [
    { path: 'submission.id', label: 'Submission id', kind: 'string' },
    { path: 'submission.status', label: 'Status', kind: 'string' },
    { path: 'submission.definitionId', label: 'Form id', kind: 'string' },
    { path: 'submission.deliveryChannel', label: 'Delivery channel', kind: 'string' },
    { path: 'submission.reviewStatus', label: 'Review status', kind: 'string' },
    { path: 'submission.submittedAt', label: 'Submitted at', kind: 'date' },
    { path: 'submission.expiresAt', label: 'Expires at', kind: 'date' },
    { path: 'submission.definition.title', label: 'Form title', kind: 'string' },
    { path: 'submission.definition.formType', label: 'Form type', kind: 'string' },
  ],
};

/**
 * Resolves the field groups available for a given trigger event type.
 * Adds branch-specific groups on top of the always-available common group.
 */
export function fieldGroupsForTrigger(triggerType: string): FieldGroup[] {
  const groups: FieldGroup[] = [COMMON_FIELDS];

  if (triggerType.startsWith('booking.')) {
    groups.push(CLIENT_FIELDS);
    // booking.waitlist.* events still produce a client + appointment context.
    if (triggerType.includes('waitlist')) {
      groups.push(APPOINTMENT_FIELDS);
    } else {
      groups.push(APPOINTMENT_FIELDS, SERVICE_FIELDS, PROVIDER_FIELDS, CLASS_BOOKING_FIELDS);
    }
  } else if (triggerType.startsWith('client.')) {
    groups.push(CLIENT_FIELDS);
  } else if (triggerType.startsWith('form.')) {
    groups.push(CLIENT_FIELDS, SUBMISSION_FIELDS);
  }
  // Unknown / forward-compat (payment.*, membership.*, soap.*, file.*, etc.)
  // get base context only — same as the enricher.

  return groups;
}

/** Flat list of all fields for the given trigger — used by VariablePicker. */
export function allFieldsForTrigger(triggerType: string): FieldDef[] {
  return fieldGroupsForTrigger(triggerType).flatMap((g) => g.fields);
}

/** Lookup a single field def by path. Returns null if unknown. */
export function findFieldDef(
  triggerType: string,
  path: string,
): FieldDef | null {
  return (
    allFieldsForTrigger(triggerType).find((f) => f.path === path) ?? null
  );
}
