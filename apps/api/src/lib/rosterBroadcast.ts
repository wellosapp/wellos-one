// In-process pub/sub bus for class-roster live updates. Powers the SSE
// endpoint at GET /staff/class-instances/:instanceId/check-ins/stream
// (PR 10 of the Geofence Auto Check-in epic).
//
// The bus is intentionally minimal: a Map<instanceId, Set<Subscriber>>.
// Publishers (geofence check-in, manual check-in, no-show, revert, cancel,
// instance state changes, waitlist auto-promote) call `publish(instanceId,
// event)` AFTER the DB transaction commits — never inside, since a rolled-
// back tx must not emit a stale broadcast.
//
// TODO(scale): in-process pub/sub only fans out within a SINGLE API
// process. Railway runs one Hobby-tier instance today so this is fine, but
// when we scale horizontally (multiple API replicas) a check-in handled by
// replica A won't notify SSE clients connected to replica B. Migrate the
// bus to Redis pub/sub (Upstash) at that point — the public API
// (subscribe/publish/unsubscribe) can stay the same; only the internal
// dispatch changes.

export type RosterEvent =
  | {
      kind: 'booking_checked_in';
      bookingId: string;
      method: 'geofence' | 'manual';
      checkedInAt: string;
      late: boolean;
    }
  | { kind: 'booking_no_show'; bookingId: string }
  | { kind: 'booking_revert_check_in'; bookingId: string }
  | { kind: 'booking_cancelled'; bookingId: string }
  | {
      kind: 'instance_state_changed';
      state: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    }
  | { kind: 'waitlist_promoted'; bookingId: string };

type Subscriber = (event: RosterEvent) => void;

class RosterBroadcast {
  private subscribers = new Map<string, Set<Subscriber>>();

  /**
   * Register a callback for roster events on a single class instance. Returns
   * a disposer; callers should invoke it on connection close to free the slot.
   */
  subscribe(instanceId: string, callback: Subscriber): () => void {
    let set = this.subscribers.get(instanceId);
    if (!set) {
      set = new Set();
      this.subscribers.set(instanceId, set);
    }
    set.add(callback);
    return () => {
      const current = this.subscribers.get(instanceId);
      if (!current) return;
      current.delete(callback);
      if (current.size === 0) {
        this.subscribers.delete(instanceId);
      }
    };
  }

  /**
   * Broadcast a roster event to every subscriber on the given instance.
   * Catches any subscriber error so one bad callback can't take down the
   * publisher path.
   */
  publish(instanceId: string, event: RosterEvent): void {
    const set = this.subscribers.get(instanceId);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(event);
      } catch {
        // Best-effort dispatch — subscribers must be defensive themselves.
      }
    }
  }
}

export const rosterBroadcast = new RosterBroadcast();
