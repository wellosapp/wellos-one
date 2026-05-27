// Automation event bus — in-process pub/sub for workflow triggers.
//
// PR 1 of the Automation System epic. See docs/specs/automation-system-epic.md.
//
// TODO(scale): single-process today (matches Wellos's current Railway Hobby
// tier and mirrors the rosterBroadcast pattern from the Geofence epic). When
// the API scales horizontally OR Epic 8 wires BullMQ + Upstash Redis,
// migrate to a real queue. Same public interface (subscribe / publish),
// different internal dispatch. The TODO marker stays so we don't forget.
//
// Publishers: services across apps/api emit events as state changes.
//   - Booking + class triggers wire in PR 11 (appointmentService,
//     classBookingService, classInstanceService).
//   - Form triggers wire in PR 12 (bridge from existing
//     IntakeFormSubmissionAudit writes).
//   - Client / file / staff triggers wire in PR 13.
//
// Subscribers: the workflow-trigger dispatcher (PR 3) subscribes once at
// boot, looks up matching active workflows by event.type + tenantId, and
// kicks off engine runs. PR 1 ships the bus + the AutomationEventType
// vocabulary; nothing subscribes yet (subscriberCount === 0 at boot).

import type { FastifyBaseLogger } from 'fastify';

// ----- Event type vocabulary -----
//
// Every trigger the automation system supports. This is the source of truth
// — when a new trigger is added in the spec, add it here first, then wire
// the publisher. Subsequent PRs filter on this union (e.g. PR 3's
// dispatcher uses event.type to find matching workflows).
//
// Categories marked BLOCKED below have schema declared here for completeness
// but their publishers don't exist yet — the corresponding epics need to
// land first. Adding the event type now keeps the workflow JSON forward-
// compatible with templates that reference triggers we can't fire yet.

export type AutomationEventType =
  // Booking
  | 'booking.appointment.created'
  | 'booking.appointment.confirmed'
  | 'booking.appointment.rescheduled'
  | 'booking.appointment.cancelled'
  | 'booking.appointment.checked_in'
  | 'booking.appointment.checked_out'
  | 'booking.appointment.completed'
  | 'booking.appointment.no_show'
  | 'booking.waitlist.joined'
  | 'booking.waitlist.promoted'
  // Client
  | 'client.created'
  | 'client.updated'
  | 'client.tagged'
  | 'client.birthday'                    // emitted by birthday cron (PR 13)
  | 'client.inactive'                    // emitted by inactivity cron (PR 13)
  | 'client.milestone.visits'
  | 'client.milestone.spend'
  | 'client.status_changed'
  | 'client.banned'
  // Forms
  | 'form.assigned'
  | 'form.sent'
  | 'form.opened'
  | 'form.started'
  | 'form.submitted'
  | 'form.completed'
  | 'form.expired'
  | 'form.requires_review'
  | 'form.approved'
  | 'form.denied'
  // Payment (BLOCKED on Epic 6 — declared here for completeness)
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.outstanding_balance_created'
  | 'payment.deposit_paid'
  | 'payment.invoice_sent'
  | 'payment.invoice_overdue'
  // Membership / package (BLOCKED on memberships epic)
  | 'membership.created'
  | 'membership.renewed'
  | 'membership.cancelled'
  | 'membership.payment_failed'
  | 'package.purchased'
  | 'package.low_balance'
  | 'package.expired'
  // Notes / alerts
  | 'note.created'
  | 'alert.created'
  | 'alert.acknowledged'
  | 'alert.allergy_created'
  | 'alert.behavioral_created'
  // SOAP / clinical
  | 'soap.note_created'
  | 'soap.note_locked'
  | 'soap.note_revised'
  | 'clinical.form_submitted'
  | 'clinical.image_uploaded'
  // Files
  | 'file.uploaded'
  | 'file.before_after_uploaded'
  | 'file.protected_uploaded'
  | 'file.client_reference_uploaded'
  // Staff
  | 'staff.invited'
  | 'staff.activated'
  | 'staff.onboarding_incomplete'
  | 'staff.certification_expiring'
  | 'staff.schedule_updated';

export interface AutomationEvent<T extends AutomationEventType = AutomationEventType> {
  /** Stable event identifier — used for idempotency dedupe. cuid() at the call site. */
  eventId: string;
  /** What happened. */
  type: T;
  /** Tenant scope — every event is tenant-scoped. */
  tenantId: string;
  /** When the event was emitted (NOT when the underlying action happened). */
  timestamp: Date;
  /**
   * Event-specific payload. Specific shapes get type-narrowed in subsequent
   * PRs (e.g. a BookingAppointmentCreatedEvent interface extending
   * AutomationEvent<'booking.appointment.created'>). PR 1 keeps this
   * `unknown` so we don't lock in shapes prematurely.
   */
  data: unknown;
}

export type AutomationEventHandler = (event: AutomationEvent) => Promise<void> | void;

// ----- Bus implementation -----

class AutomationEventBus {
  private subscribers: Set<AutomationEventHandler> = new Set();
  private log?: FastifyBaseLogger;

  /**
   * Optional logger injection. The dispatcher (PR 3) wires this at boot so
   * handler failures get logged through the same Pino pipeline as the rest
   * of the API. Until then, failures are swallowed silently — which is fine
   * because nothing subscribes in PR 1.
   */
  setLogger(log: FastifyBaseLogger): void {
    this.log = log;
  }

  /**
   * Subscribe to all events. The trigger dispatcher (PR 3) is the primary
   * subscriber and filters by event.type internally. Returns an unsubscribe
   * function — callers should invoke it on shutdown to drop the reference.
   */
  subscribe(handler: AutomationEventHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /**
   * Publish an event to all subscribers. Best-effort: per-subscriber
   * failures are caught + logged, never propagated back to the caller.
   * Publishers should not block on automation processing — the dispatcher
   * persists pending runs to automation_runs so nothing is lost if the
   * process dies mid-handler.
   */
  async publish(event: AutomationEvent): Promise<void> {
    if (this.subscribers.size === 0) {
      // No subscribers yet (e.g. before PR 3 mounts the dispatcher).
      // Don't log — would be too noisy as every state change emits.
      return;
    }
    const promises = Array.from(this.subscribers).map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        this.log?.warn(
          { err, eventType: event.type, eventId: event.eventId, tenantId: event.tenantId },
          'automation event handler failed',
        );
      }
    });
    // allSettled — one failing handler must not abort the others.
    await Promise.allSettled(promises);
  }

  /** Test/debug helper: how many handlers are registered. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Test helper: clear all subscribers. NOT for production use — only the
   * trigger-dispatcher tests (PR 3) and the engine tests (PR 2) should
   * touch this between cases.
   */
  _clearAllSubscribers(): void {
    this.subscribers.clear();
  }
}

export const automationEventBus = new AutomationEventBus();
