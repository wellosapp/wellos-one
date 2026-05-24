'use client';

// Dedicated picker for staff_services M2M assignment. Replaces the flat
// checkbox grid that used to live inside the Overview StaffForm. Adds
// real-time search + category grouping + duration/price meta line. Backed
// by updateStaffServicesAction which only PATCHes `serviceIds` so the
// rest of the staff record is untouched.
//
// useFormState + useFormStatus are the React-18 equivalents of
// useActionState (React 19). Next.js 14 ships React 18 so these are what
// actually exist at runtime.

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, Input } from '@/components/ui';
import { SearchIcon } from '@/app/admin/_shell/icons';

import {
  updateStaffServicesAction,
  type ServicesActionState,
} from './_actions';

type ServiceOption = {
  id: string;
  name: string;
  color: string | null;
  durationMinutes: number;
  basePriceCents: number;
  category: { id: string; name: string } | null;
};

type Props = {
  staffId: string;
  services: ServiceOption[];
  initialServiceIds: string[];
  /** When the staff member is soft-deleted, render read-only. */
  readOnly?: boolean;
};

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(2)}`;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="md"
      loading={pending}
      disabled={disabled || pending}
    >
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

export function ServicesPicker({
  staffId,
  services,
  initialServiceIds,
  readOnly = false,
}: Props) {
  const boundAction = updateStaffServicesAction.bind(null, staffId);
  const [state, formAction] = useFormState<ServicesActionState, FormData>(
    boundAction,
    { ok: false },
  );

  // The persisted baseline — what the DB believes is selected. Rolls
  // forward after a successful save so the Save button re-disables.
  const [baseline, setBaseline] = useState<Set<string>>(
    () => new Set(initialServiceIds),
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialServiceIds),
  );
  const [query, setQuery] = useState('');

  // After a successful save, advance the baseline to what we just sent
  // so the Save button disables until the next change.
  useEffect(() => {
    if (state.ok) {
      setBaseline(new Set(selected));
    }
    // We only want this to fire when the action result flips to ok=true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? services.filter((s) => s.name.toLowerCase().includes(needle))
      : services;

    type Group = {
      id: string;
      name: string;
      services: ServiceOption[];
      isUncategorized: boolean;
    };
    const byId = new Map<string, Group>();
    for (const s of filtered) {
      const key = s.category?.id ?? '__uncategorized__';
      const existing = byId.get(key);
      if (existing) {
        existing.services.push(s);
      } else {
        byId.set(key, {
          id: key,
          name: s.category?.name ?? 'Uncategorized',
          services: [s],
          isUncategorized: s.category === null,
        });
      }
    }

    // Alphabetical by category name, Uncategorized always last.
    return Array.from(byId.values()).sort((a, b) => {
      if (a.isUncategorized && !b.isUncategorized) return 1;
      if (!a.isUncategorized && b.isUncategorized) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [services, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setSelected(new Set(baseline));
  };

  const noChanges = setsEqual(selected, baseline);
  const totalSelected = selected.size;
  const totalServices = services.length;

  if (totalServices === 0) {
    return (
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          No services exist yet. Create some on the Services page first.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      {state.ok && <Alert tone="success">Service assignments saved.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-s3">
        <div className="min-w-[260px] flex-1">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter services..."
            icon={<SearchIcon size={18} />}
            aria-label="Filter services"
            disabled={readOnly}
          />
        </div>
        <span className="t-caption uppercase tracking-wide text-ink-4 tabular-nums">
          {totalSelected} selected
        </span>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
          <p className="t-body-md text-ink-3">
            No services match &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-s5">
          {grouped.map((group) => (
            <div key={group.id} className="flex flex-col gap-s2">
              <div className="flex items-center gap-s2">
                <span className="t-eyebrow tracking-wide text-ink-3">
                  {group.name}
                </span>
                <span className="t-caption text-ink-4 tabular-nums">
                  ({group.services.length})
                </span>
              </div>
              <div className="flex flex-col gap-s1">
                {group.services.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-s2 rounded-sm px-s2 py-s2 transition-colors duration-fast hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        name="serviceIds"
                        value={s.id}
                        checked={checked}
                        onChange={() => toggle(s.id)}
                        disabled={readOnly}
                        className="h-[18px] w-[18px] cursor-pointer accent-accent"
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          backgroundColor: s.color ?? 'transparent',
                        }}
                        className="inline-block h-[12px] w-[12px] shrink-0 rounded-sm border border-line"
                      />
                      <span className="t-body-md text-ink">{s.name}</span>
                      <span className="flex-1" />
                      <span className="t-caption uppercase tracking-wide text-ink-4 tabular-nums">
                        {s.durationMinutes} min &middot; {formatPrice(s.basePriceCents)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {readOnly ? (
        <p className="t-body-sm text-ink-soft">
          Services are read-only for soft-deleted staff.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-s3 border-t border-line pt-s4">
          <SaveButton disabled={noChanges} />
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={reset}
            disabled={noChanges}
          >
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
