'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships React 18
// canary at runtime — see hotfix #28 for context.
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';

import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
// Reused directly from services/ per Phase 1 spec — no port. Both the
// picker (client component) and the constants module are tenant-agnostic.
import { ServiceColorPicker } from '@/app/admin/services/ServiceColorPicker';
import type { BrandColor } from '@/app/admin/services/_constants/colors';

import type { ActionState, ClassFormValues } from './_actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

type StaffOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
};

type CategoryOption = {
  id: string;
  name: string;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ClassFormValues;
  staff: StaffOption[];
  categories: CategoryOption[];
  submitLabel?: string;
  successMessage?: string;
  /** Tenant brand-color palette. Defaults via ServiceColorPicker to the
   *  Wellos FALLBACK_BRAND_COLORS when omitted. */
  presets?: BrandColor[];
};

export function ClassForm({
  action,
  initial,
  staff,
  categories,
  submitLabel = 'Save',
  successMessage = 'Saved.',
  presets,
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    ok: false,
  });

  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const initialInstructorIds = new Set(values.instructorIds ?? []);

  // Local state for allowWaitlist so the waitlist-limit field can show/hide
  // without a full re-render through the server action. The form submit
  // value still comes through the hidden checkbox.
  const [allowWaitlist, setAllowWaitlist] = useState<boolean>(
    values.allowWaitlist ?? initial?.allowWaitlist ?? false,
  );

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <FormField label="Name" required error={fieldErrors.name}>
        <Input
          type="text"
          name="name"
          required
          maxLength={120}
          defaultValue={values.name ?? ''}
          error={Boolean(fieldErrors.name)}
        />
      </FormField>

      <FormField
        label="Short description"
        error={fieldErrors.shortDescription}
        hint="Optional. Short line shown on schedule cards (max 280 characters)."
      >
        <Input
          type="text"
          name="shortDescription"
          maxLength={280}
          defaultValue={values.shortDescription ?? ''}
          error={Boolean(fieldErrors.shortDescription)}
        />
      </FormField>

      <FormField
        label="Long description"
        error={fieldErrors.longDescription}
        hint="Optional. Longer description for the class detail page."
      >
        <Textarea
          name="longDescription"
          rows={4}
          maxLength={5000}
          defaultValue={values.longDescription ?? ''}
          error={Boolean(fieldErrors.longDescription)}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Duration (minutes)"
          required
          error={fieldErrors.durationMinutes}
          hint="How long each class session lasts (5–720 minutes)."
        >
          <Input
            type="number"
            name="durationMinutes"
            inputMode="numeric"
            min={5}
            max={720}
            step={1}
            required
            defaultValue={values.durationMinutes ?? ''}
            error={Boolean(fieldErrors.durationMinutes)}
          />
        </FormField>

        <FormField
          label="Base price (USD)"
          error={fieldErrors.basePriceDollars}
          hint="Leave blank or 0 for a free class. Two decimals."
        >
          <Input
            type="number"
            name="basePriceDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={values.basePriceDollars ?? ''}
            error={Boolean(fieldErrors.basePriceDollars)}
          />
        </FormField>
      </div>

      <FormField
        label="Category"
        error={fieldErrors.categoryId}
        hint="Optional. Manage categories on the Service categories page."
      >
        <Select
          name="categoryId"
          defaultValue={
            values.categoryId !== undefined && values.categoryId !== ''
              ? values.categoryId
              : initial?.categoryId ?? ''
          }
          className="w-full max-w-md"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Color"
        error={fieldErrors.color}
        hint="Used on the schedule and the public booking flow."
      >
        <ServiceColorPicker
          name="color"
          defaultValue={values.color ?? ''}
          error={Boolean(fieldErrors.color)}
          presets={presets}
        />
      </FormField>

      <fieldset className="flex flex-col gap-s4 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Capacity</legend>
        <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
          <FormField
            label="Max capacity"
            required
            error={fieldErrors.maxCapacity}
            hint="Maximum simultaneous attendees."
          >
            <Input
              type="number"
              name="maxCapacity"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              required
              defaultValue={values.maxCapacity ?? ''}
              error={Boolean(fieldErrors.maxCapacity)}
            />
          </FormField>

          <FormField
            label="Min to run"
            error={fieldErrors.minToRun}
            hint="Class auto-cancels if fewer than this register by start time."
          >
            <Input
              type="number"
              name="minToRun"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              defaultValue={
                values.minToRun ??
                (initial?.minToRun !== undefined ? initial.minToRun : '1')
              }
              error={Boolean(fieldErrors.minToRun)}
            />
          </FormField>
        </div>

        <FormField
          label="Allow waitlist"
          error={fieldErrors.allowWaitlist}
          hint="Capture demand beyond capacity."
        >
          <label className="flex h-[50px] items-center gap-s2">
            <input
              type="checkbox"
              name="allowWaitlist"
              value="1"
              checked={allowWaitlist}
              onChange={(e) => setAllowWaitlist(e.target.checked)}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Let clients join a waitlist when the class is full
            </span>
          </label>
        </FormField>

        {allowWaitlist && (
          <FormField
            label="Waitlist limit"
            error={fieldErrors.waitlistLimit}
            hint="Maximum waitlist entries. 0 means unlimited."
          >
            <Input
              type="number"
              name="waitlistLimit"
              inputMode="numeric"
              min={0}
              max={500}
              step={1}
              defaultValue={
                values.waitlistLimit ??
                (initial?.waitlistLimit !== undefined
                  ? initial.waitlistLimit
                  : '0')
              }
              error={Boolean(fieldErrors.waitlistLimit)}
            />
          </FormField>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Room turnover</legend>
        <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
          <FormField
            label="Buffer before (minutes)"
            error={fieldErrors.bufferBeforeMinutes}
            hint="Setup time before the class starts."
          >
            <Input
              type="number"
              name="bufferBeforeMinutes"
              inputMode="numeric"
              min={0}
              max={240}
              step={1}
              defaultValue={
                values.bufferBeforeMinutes ??
                (initial?.bufferBeforeMinutes !== undefined
                  ? initial.bufferBeforeMinutes
                  : '0')
              }
              error={Boolean(fieldErrors.bufferBeforeMinutes)}
            />
          </FormField>

          <FormField
            label="Buffer after (minutes)"
            error={fieldErrors.bufferAfterMinutes}
            hint="Cleanup time after the class ends."
          >
            <Input
              type="number"
              name="bufferAfterMinutes"
              inputMode="numeric"
              min={0}
              max={240}
              step={1}
              defaultValue={
                values.bufferAfterMinutes ??
                (initial?.bufferAfterMinutes !== undefined
                  ? initial.bufferAfterMinutes
                  : '0')
              }
              error={Boolean(fieldErrors.bufferAfterMinutes)}
            />
          </FormField>
        </div>
      </fieldset>

      <FormField label="Active" error={fieldErrors.active}>
        <label className="flex h-[50px] items-center gap-s2">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={values.active ?? initial?.active ?? true}
            className="h-[18px] w-[18px] cursor-pointer accent-accent"
          />
          <span className="t-body-md text-ink-soft">
            Bookable on the public schedule
          </span>
        </label>
      </FormField>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Instructors</legend>
        {staff.length === 0 ? (
          <p className="t-body-sm text-ink-soft">
            No staff exist yet. Create some on the Staff page first.
          </p>
        ) : (
          <>
            <p className="t-caption text-ink-soft">
              The first selected instructor is marked as the primary instructor
              for this class.
            </p>
            <div className="grid grid-cols-1 gap-s2 md:grid-cols-2">
              {staff.map((s) => {
                const fullName = `${s.firstName}${
                  s.lastName ? ' ' + s.lastName : ''
                }`;
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-s2 rounded-sm px-s2 py-s1 transition-colors duration-fast hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      name="instructorIds"
                      value={s.id}
                      defaultChecked={initialInstructorIds.has(s.id)}
                      className="h-[18px] w-[18px] cursor-pointer accent-accent"
                    />
                    <span className="flex flex-col">
                      <span className="t-body-md text-ink">{fullName}</span>
                      {s.jobTitle && (
                        <span className="t-caption text-ink-soft">
                          {s.jobTitle}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        {fieldErrors.instructorIds && (
          <span className="t-caption text-red font-sans">
            {fieldErrors.instructorIds}
          </span>
        )}
      </fieldset>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
