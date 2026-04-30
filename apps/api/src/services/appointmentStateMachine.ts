import type { AppointmentStatus } from '@prisma/client';

// Single source of truth for allowed appointment-state transitions (E3-S1).
// Service layer + transition route both call assertTransition().
//
// Transitions:
//   scheduled    → confirmed | cancelled
//   confirmed    → checked_in | cancelled | no_show
//   checked_in   → in_progress | cancelled
//   in_progress  → completed
//   completed    → (terminal)
//   cancelled    → (terminal)
//   no_show      → (terminal)
//
// Reverse / repair transitions are intentionally disallowed at the service
// layer. If a staff member marks a no-show in error, an admin must reach
// into the DB. Per Epic 3 spec: "no_show is a reporting distinction, not
// an availability one" — once it's set, the appointment is part of history.

const ALLOWED: Record<AppointmentStatus, ReadonlyArray<AppointmentStatus>> = {
  scheduled:   ['confirmed', 'cancelled'],
  confirmed:   ['checked_in', 'cancelled', 'no_show'],
  checked_in:  ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

export class InvalidStateTransitionError extends Error {
  code = 'INVALID_STATE_TRANSITION' as const;
  from: AppointmentStatus;
  to: AppointmentStatus;
  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(`Cannot transition appointment from ${from} to ${to}.`);
    this.name = 'InvalidStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function isAllowedTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (from === to) {
    throw new InvalidStateTransitionError(from, to);
  }
  if (!isAllowedTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

// Whether a state currently OCCUPIES a slot for double-book purposes.
// Mirrors the partial filter on the EXCLUDE constraint:
//   occupies = state NOT IN (cancelled, no_show)
// Used by availabilityService when subtracting existing appointments from
// candidate slots.
export function stateOccupiesSlot(state: AppointmentStatus): boolean {
  return state !== 'cancelled' && state !== 'no_show';
}

// Terminal states cannot transition further.
export function isTerminal(state: AppointmentStatus): boolean {
  return ALLOWED[state].length === 0;
}
