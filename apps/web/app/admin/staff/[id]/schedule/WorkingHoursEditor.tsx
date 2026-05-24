'use client';

// Dedicated per-day shifts editor for the staff Schedule tab. Replaces
// the working-hours fieldset that used to live inline in the Overview
// StaffForm. Backed by updateStaffScheduleAction which only PATCHes
// `workingHours` so other staff fields are untouched.
//
// useFormState + useFormStatus are the React-18 equivalents of
// useActionState (React 19). Next.js 14 ships React 18 so these are what
// actually exist at runtime — ESLint rule from #102 blocks the React-19
// import.

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, Input } from '@/components/ui';
import { DAY_KEYS, DAY_LABELS, type DayKey } from '@/lib/staff-days';

import {
  updateStaffScheduleAction,
  type ScheduleActionState,
  type WorkingHoursFormValues,
} from './_actions';

type DayRowState = { closed: boolean; start?: string; end?: string };

type Props = {
  staffId: string;
  initial: WorkingHoursFormValues;
  /** When the staff member is soft-deleted, render read-only. */
  readOnly?: boolean;
};

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

function rowsEqual(a: DayRowState | undefined, b: DayRowState | undefined): boolean {
  const aClosed = a?.closed ?? true;
  const bClosed = b?.closed ?? true;
  if (aClosed !== bClosed) return false;
  if (aClosed) return true;
  return (a?.start ?? '') === (b?.start ?? '') && (a?.end ?? '') === (b?.end ?? '');
}

function equalsBaseline(
  a: WorkingHoursFormValues,
  b: WorkingHoursFormValues,
): boolean {
  for (const day of DAY_KEYS) {
    if (!rowsEqual(a[day], b[day])) return false;
  }
  return true;
}

function cloneValues(values: WorkingHoursFormValues): WorkingHoursFormValues {
  const out: WorkingHoursFormValues = {};
  for (const day of DAY_KEYS) {
    const row = values[day];
    out[day] = row ? { closed: row.closed, start: row.start, end: row.end } : { closed: true };
  }
  return out;
}

export function WorkingHoursEditor({
  staffId,
  initial,
  readOnly = false,
}: Props) {
  const boundAction = updateStaffScheduleAction.bind(null, staffId);
  const [state, formAction] = useFormState<ScheduleActionState, FormData>(
    boundAction,
    { ok: false },
  );

  // The persisted baseline — what the DB believes is set. Rolls forward
  // after a successful save so the Save button re-disables.
  const [baseline, setBaseline] = useState<WorkingHoursFormValues>(() =>
    cloneValues(initial),
  );
  const [values, setValues] = useState<WorkingHoursFormValues>(() =>
    cloneValues(initial),
  );

  // After a successful save, advance the baseline to what we just sent
  // so the Save button disables until the next change.
  useEffect(() => {
    if (state.ok) {
      setBaseline(cloneValues(values));
    }
    // We only want this to fire when the action result flips to ok=true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldErrors = state.fieldErrors ?? {};
  const noChanges = equalsBaseline(values, baseline);

  const updateDay = (day: DayKey, patch: Partial<DayRowState>) => {
    setValues((prev) => {
      const current = prev[day] ?? { closed: true };
      return { ...prev, [day]: { ...current, ...patch } };
    });
  };

  const reset = () => {
    setValues(cloneValues(baseline));
  };

  return (
    <form action={formAction} className="flex flex-col gap-s5">
      {state.ok && <Alert tone="success">Working hours saved.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <p className="t-body-sm text-ink-soft">
        Single shift per day for now. 24-hour HH:MM format. Mark Closed for off days.
      </p>

      <div className="flex flex-col gap-s2">
        {DAY_KEYS.map((day) => {
          const row = values[day] ?? { closed: true };
          const error = fieldErrors[`workingHours_${day}`];
          return (
            <div key={day} className="flex flex-col gap-s1">
              <div className="grid grid-cols-1 items-center gap-s2 md:grid-cols-[160px_auto_1fr_1fr]">
                <span className="t-body-md text-ink">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-s2 t-body-sm text-ink-soft">
                  <input
                    type="checkbox"
                    name={`workingHours_${day}_closed`}
                    value="1"
                    checked={row.closed}
                    onChange={(e) => updateDay(day, { closed: e.target.checked })}
                    disabled={readOnly}
                    className="h-[16px] w-[16px] cursor-pointer accent-accent"
                  />
                  Closed
                </label>
                <Input
                  type="time"
                  name={`workingHours_${day}_start`}
                  value={row.start ?? ''}
                  onChange={(e) => updateDay(day, { start: e.target.value })}
                  disabled={readOnly || row.closed}
                  error={Boolean(error)}
                  aria-label={`${DAY_LABELS[day]} start time`}
                />
                <Input
                  type="time"
                  name={`workingHours_${day}_end`}
                  value={row.end ?? ''}
                  onChange={(e) => updateDay(day, { end: e.target.value })}
                  disabled={readOnly || row.closed}
                  error={Boolean(error)}
                  aria-label={`${DAY_LABELS[day]} end time`}
                />
              </div>
              {error && (
                <span className="t-caption text-red font-sans md:ml-[168px]">
                  {error}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="t-body-sm text-ink-soft">
          Working hours are read-only for soft-deleted staff.
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
