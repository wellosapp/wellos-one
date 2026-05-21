'use client';

import { useEffect, useState, useTransition } from 'react';

import { Alert, Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Client } from '@/lib/api/clients';

import {
  reassignDisputedMatchAction,
  searchClientsForReassignAction,
} from './_actions';

// Modal-style reassign picker. Opened from a row "Reassign" link; closes
// itself on success (the server action revalidates the list). Debounced
// typeahead against /admin/clients?q=, matches the QuickBookPanel pattern.

interface ReassignDialogProps {
  appointmentId: string;
  currentClientLabel: string;
  open: boolean;
  onClose: () => void;
}

export function ReassignDialog({
  appointmentId,
  currentClientLabel,
  open,
  onClose,
}: ReassignDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [chosen, setChosen] = useState<Client | null>(null);
  const [searchPending, startSearch] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog closes so a re-open starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setChosen(null);
      setError(null);
    }
  }, [open]);

  // Esc to close — bound only while open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Debounced typeahead. Skip while a chosen client is locked in.
  useEffect(() => {
    if (chosen) return;
    const handle = setTimeout(() => {
      const q = query.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const res = await searchClientsForReassignAction(q);
        if (res.error) {
          setError(res.error);
          setResults([]);
        } else {
          setError(null);
          setResults(res.clients);
        }
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, chosen]);

  if (!open) return null;

  function handleSubmit() {
    if (!chosen) return;
    setError(null);
    startSubmit(async () => {
      const res = await reassignDisputedMatchAction(appointmentId, chosen.id);
      if (res.ok) {
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  function fullName(c: Client): string {
    return c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Reassign appointment to client"
    >
      <button
        type="button"
        aria-label="Close reassign dialog overlay"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative w-full max-w-[520px] rounded-lg bg-white shadow-lg',
          'mx-s4 flex max-h-[88vh] flex-col',
        )}
      >
        <header className="flex items-start justify-between gap-s4 border-b border-surface-3 px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <span className="t-eyebrow text-accent">Reassign</span>
            <h2 className="t-display-md text-ink">Reassign to client</h2>
            <p className="t-body-sm text-ink-soft">
              Currently attached to <span className="text-ink">{currentClientLabel}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors duration-fast hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-s4 overflow-y-auto px-s6 py-s5">
          {chosen ? (
            <div className="flex items-center justify-between gap-s3 rounded-md border border-accent/30 bg-accent-pale/40 px-s4 py-s3">
              <div className="flex flex-col">
                <span className="t-body-md text-ink">{fullName(chosen)}</span>
                <span className="t-body-sm text-ink-soft">
                  {chosen.email ?? chosen.phone ?? 'No contact on file'}
                </span>
              </div>
              <button
                type="button"
                className="t-body-sm text-accent underline-offset-2 hover:underline"
                onClick={() => setChosen(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Input
                type="text"
                placeholder="Search by name, email, or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {searchPending && (
                <span className="t-caption text-ink-soft">Searching…</span>
              )}
              {results.length > 0 && (
                <ul className="flex max-h-[260px] flex-col overflow-y-auto rounded-md border border-surface-3 bg-white">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-[2px] border-b border-surface-3 px-s4 py-s3 text-left last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                        onClick={() => setChosen(c)}
                      >
                        <span className="t-body-md text-ink">{fullName(c)}</span>
                        <span className="t-body-sm text-ink-soft">
                          {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searchPending &&
                query.trim().length >= 2 &&
                results.length === 0 && (
                  <span className="t-caption text-ink-soft italic">
                    No matches.
                  </span>
                )}
              {query.trim().length < 2 && (
                <span className="t-caption text-ink-soft">
                  Type at least 2 characters to search.
                </span>
              )}
            </>
          )}

          {error && <Alert tone="error">{error}</Alert>}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-s3 border-t border-surface-3 px-s6 py-s4">
          <Button variant="ghost" size="md" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            variant="accent"
            size="md"
            type="button"
            disabled={!chosen || submitPending}
            loading={submitPending}
            onClick={handleSubmit}
          >
            Reassign
          </Button>
        </footer>
      </div>
    </div>
  );
}
