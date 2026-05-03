'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import { Alert, Button, Input } from '@/components/ui';
import type { WhoamiLocation } from '@/lib/api/whoami';
import type { Staff } from '@/lib/api/staff';

import {
  createStaffScheduleBlockAction,
  type ActionState,
} from './_actions';

const CATEGORIES = [
  'break',
  'lunch',
  'pto',
  'meeting',
  'training',
  'maintenance',
  'closure',
  'custom',
] as const;

function SaveBlockButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="md" loading={pending}>
      {pending ? 'Saving…' : 'Save block'}
    </Button>
  );
}

interface BlockTimeSheetProps {
  staff: Staff[];
  locations: WhoamiLocation[];
  dateParam: string;
  hrefClose: string;
  defaultStaffId?: string;
}

export function BlockTimeSheet({
  staff,
  locations,
  dateParam,
  hrefClose,
  defaultStaffId,
}: BlockTimeSheetProps) {
  const router = useRouter();
  const [state, formAction] = useFormState<ActionState, FormData>(
    createStaffScheduleBlockAction,
    { ok: false },
  );

  useEffect(() => {
    if (state.ok) {
      router.push(hrefClose as Route);
      router.refresh();
    }
  }, [state.ok, hrefClose, router]);

  return (
    <aside
      className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm lg:max-w-[360px]"
      aria-label="Block time"
    >
      <div className="mb-s4 flex items-start justify-between gap-s3">
        <div>
          <span className="t-eyebrow text-accent">Schedule</span>
          <h2 className="t-heading-md font-semibold text-ink">Block time</h2>
          <p className="mt-s1 t-caption text-ink-soft">
            Breaks, PTO, meetings — blocks booking and shows on the day grid.
          </p>
        </div>
        <Link
          href={hrefClose as Route}
          className="t-caption font-medium text-ink-soft no-underline hover:text-ink"
        >
          Close
        </Link>
      </div>

      {state.error && !state.ok && (
        <Alert tone="error" className="mb-s4">
          {state.error}
        </Alert>
      )}

      <form action={formAction} className="flex flex-col gap-s4">
        <input type="hidden" name="date" value={dateParam} />

        <label className="flex flex-col gap-s1">
          <span className="t-caption font-medium text-ink">Staff</span>
          <select
            name="staffId"
            required
            defaultValue={defaultStaffId ?? staff[0]?.id}
            className="rounded-md border border-surface-3 bg-white px-s3 py-s2 t-body-sm text-ink"
          >
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName}
                {s.lastName ? ` ${s.lastName}` : ''}
              </option>
            ))}
          </select>
          {state.fieldErrors?.staffId && (
            <span className="t-caption text-red">{state.fieldErrors.staffId}</span>
          )}
        </label>

        {locations.length > 0 ? (
          <label className="flex flex-col gap-s1">
            <span className="t-caption font-medium text-ink">
              Location (optional)
            </span>
            <select
              name="locationId"
              className="rounded-md border border-surface-3 bg-white px-s3 py-s2 t-body-sm text-ink"
            >
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-s1">
          <span className="t-caption font-medium text-ink">Category</span>
          <select
            name="category"
            required
            defaultValue="break"
            className="rounded-md border border-surface-3 bg-white px-s3 py-s2 t-body-sm text-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          {state.fieldErrors?.category && (
            <span className="t-caption text-red">{state.fieldErrors.category}</span>
          )}
        </label>

        <label className="flex flex-col gap-s1">
          <span className="t-caption font-medium text-ink">Title</span>
          <Input name="title" required placeholder="e.g. Lunch" maxLength={200} />
          {state.fieldErrors?.title && (
            <span className="t-caption text-red">{state.fieldErrors.title}</span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-s3">
          <label className="flex flex-col gap-s1">
            <span className="t-caption font-medium text-ink">Start</span>
            <Input name="startTime" type="time" required />
            {state.fieldErrors?.startTime && (
              <span className="t-caption text-red">{state.fieldErrors.startTime}</span>
            )}
          </label>
          <label className="flex flex-col gap-s1">
            <span className="t-caption font-medium text-ink">End</span>
            <Input name="endTime" type="time" required />
            {state.fieldErrors?.endTime && (
              <span className="t-caption text-red">{state.fieldErrors.endTime}</span>
            )}
          </label>
        </div>

        <div className="flex flex-col gap-s2 border-t border-surface-3 pt-s4 sm:flex-row sm:justify-end">
          <Link
            href={hrefClose as Route}
            className="inline-flex items-center justify-center rounded-md px-s4 py-s2 t-body-sm font-medium text-ink-soft no-underline hover:bg-surface-2 hover:text-ink"
          >
            Cancel
          </Link>
          <SaveBlockButton />
        </div>
      </form>
    </aside>
  );
}
