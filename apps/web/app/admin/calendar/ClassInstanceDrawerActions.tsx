'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Button, Input, Textarea } from '@/components/ui';
import type { Client } from '@/lib/api/clients';

import {
  addClientToClassInstanceAction,
  cancelClassBookingAction,
  promoteWaitlistEntryAction,
  searchClientsAction,
} from './_actions';

// Inline action UIs for the class-instance roster drawer (Classes Phase 3a).
// Mirrors the useTransition + inline-confirm patterns used in QuickBookPanel
// and the existing AppointmentDrawer cancel flow. Each component owns its own
// pending/error state so a long-running call on one row doesn't freeze the
// others.

// ---------- AddClientButton ----------

/**
 * Inline "+ Add client" affordance. Toggles into a search input on click;
 * picking a result fires addClientToClassInstanceAction with a fresh UUID
 * idempotency key per attempt. The action's tagged-union response decides
 * whether the result message says "booked" or "added to waitlist position N".
 */
export function AddClientToClassInstanceButton({
  instanceId,
}: {
  instanceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searchPending, startSearch] = useTransition();
  const [bookPending, startBook] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      startSearch(async () => {
        const res = await searchClientsAction(query.trim());
        if (!res.error) setResults(res.clients);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [open, query]);

  const reset = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
    setErrorCode(null);
  };

  const handlePick = (client: Client) => {
    setError(null);
    setErrorCode(null);
    setSuccess(null);
    // Fresh idempotency key per attempt (the user explicitly chose this
    // client now). If the action fails and the user retries, we want a
    // fresh attempt, not a server-side replay.
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `book-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    startBook(async () => {
      const res = await addClientToClassInstanceAction({
        instanceId,
        clientId: client.id,
        idempotencyKey,
      });
      if (!res.ok) {
        setError(res.error);
        setErrorCode(res.code ?? null);
        return;
      }
      const name = [client.firstName, client.lastName]
        .filter(Boolean)
        .join(' ');
      if (res.result.kind === 'booking') {
        setSuccess(`Booked ${name || 'client'}.`);
      } else {
        setSuccess(
          `Added ${name || 'client'} to the waitlist (position ${
            res.result.entry.position
          }).`,
        );
      }
      reset();
      router.refresh();
    });
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-s2">
        {success && <Alert tone="success">{success}</Alert>}
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            setOpen(true);
            setSuccess(null);
            setError(null);
            setErrorCode(null);
          }}
        >
          + Add client
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-s3 rounded-md border border-surface-3 bg-surface px-s3 py-s3">
      <div className="flex items-center justify-between gap-s3">
        <span className="t-caption font-semibold text-ink">Add client</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={bookPending}
        >
          Cancel
        </Button>
      </div>
      <Input
        autoFocus
        type="search"
        placeholder="Search name, email, or phone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={bookPending}
      />
      {error && (
        <Alert tone="error">
          {error}
          {errorCode && (
            <span className="ml-s1 t-caption text-ink-soft">({errorCode})</span>
          )}
        </Alert>
      )}
      {query.trim().length >= 2 && (
        <ul className="flex max-h-[240px] flex-col gap-s1 overflow-y-auto">
          {searchPending && (
            <li className="t-caption text-ink-soft">Searching…</li>
          )}
          {!searchPending && results.length === 0 && (
            <li className="t-caption text-ink-soft">No matches.</li>
          )}
          {results.map((c) => {
            const display = [c.firstName, c.lastName].filter(Boolean).join(' ');
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handlePick(c)}
                  disabled={bookPending}
                  className="flex w-full flex-col items-start gap-[2px] rounded-sm px-s2 py-s1 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <span className="t-body-sm font-medium text-ink">
                    {display || 'Unnamed'}
                  </span>
                  {(c.email || c.phone) && (
                    <span className="t-caption text-ink-soft">
                      {[c.email, c.phone].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- CancelBookingButton ----------

export function CancelBookingButton({
  instanceId,
  bookingId,
}: {
  instanceId: string;
  bookingId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelClassBookingAction({
        instanceId,
        bookingId,
        reason: reason.trim().length > 0 ? reason.trim() : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      setReason('');
      router.refresh();
    });
  };

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red hover:bg-red-pale"
        onClick={() => setConfirming(true)}
      >
        Cancel
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-s2 rounded-md border border-red/30 bg-red-pale/40 p-s3">
      {error && <Alert tone="error">{error}</Alert>}
      <Textarea
        name="reason"
        rows={2}
        maxLength={500}
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-s2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(false);
            setReason('');
            setError(null);
          }}
          disabled={pending}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="bg-red hover:bg-red"
          onClick={handleCancel}
          loading={pending}
        >
          {pending ? 'Cancelling…' : 'Confirm cancel'}
        </Button>
      </div>
    </div>
  );
}

// ---------- PromoteWaitlistButton ----------

export function PromoteWaitlistButton({
  instanceId,
  entryId,
}: {
  instanceId: string;
  entryId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePromote = () => {
    setError(null);
    startTransition(async () => {
      const res = await promoteWaitlistEntryAction({ instanceId, entryId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-s1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handlePromote}
        loading={pending}
        disabled={pending}
      >
        {pending ? 'Promoting…' : 'Promote'}
      </Button>
      {error && (
        <span className="t-caption text-red text-right max-w-[200px]">
          {error}
        </span>
      )}
    </div>
  );
}
