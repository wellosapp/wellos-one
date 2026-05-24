'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships React 18
// canary at runtime — see hotfix #28 for context.
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Select, Textarea } from '@/components/ui';

import type { ActionState, ServiceFormValues } from './_actions';
import type { BookingPolicy, ServicePriceDisplayMode } from '@/lib/api/services';
import type { BrandColor } from './_constants/colors';
import { ServiceColorPicker } from './ServiceColorPicker';

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

const PRICE_MODES: { value: ServicePriceDisplayMode; label: string }[] = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'starting_at', label: 'Starting at' },
  { value: 'range', label: 'Price range' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'consultation', label: 'Consultation' },
];

// R2 §11 — public booking policy options. Default is `instant` (matches DB).
const BOOKING_POLICIES: {
  value: BookingPolicy;
  label: string;
  hint: string;
}[] = [
  {
    value: 'instant',
    label: 'Instant booking',
    hint: 'Confirmed the moment the client books.',
  },
  {
    value: 'request_approval',
    label: 'Request approval',
    hint: 'Client submits a request; staff approves to confirm.',
  },
  {
    value: 'staff_only',
    label: 'Staff-only',
    hint: 'Hidden from public booking. Staff book directly.',
  },
];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ServiceFormValues;
  staff: StaffOption[];
  categories: CategoryOption[];
  submitLabel?: string;
  successMessage?: string;
  /** Tenant brand-color palette. Defaults via ServiceColorPicker to the
   *  Wellos FALLBACK_BRAND_COLORS when omitted. */
  presets?: BrandColor[];
};

export function ServiceForm({
  action,
  initial,
  staff,
  categories,
  submitLabel = 'Save',
  successMessage = 'Saved.',
  presets,
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const initialStaffIds = new Set(values.staffIds ?? []);

  const priceMode =
    values.priceDisplayMode ??
    initial?.priceDisplayMode ??
    'fixed';

  const bookingPolicy: BookingPolicy =
    values.bookingPolicy ?? initial?.bookingPolicy ?? 'instant';

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <FormField label="Name" required error={fieldErrors.name}>
        <Input
          type="text"
          name="name"
          required
          maxLength={200}
          defaultValue={values.name ?? ''}
          error={Boolean(fieldErrors.name)}
        />
      </FormField>

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

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Display order"
          error={fieldErrors.displayOrder}
          hint="Lower numbers appear first in lists."
        >
          <Input
            type="number"
            name="displayOrder"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={
              values.displayOrder ??
              (initial?.displayOrder !== undefined ? initial.displayOrder : '0')
            }
          />
        </FormField>

        <FormField label="Price display" error={fieldErrors.priceDisplayMode}>
          <Select
            name="priceDisplayMode"
            defaultValue={priceMode}
            className="w-full"
          >
            {PRICE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        label="Public catalog"
        error={fieldErrors.publicVisible}
        hint="When off, hidden from the public booking catalog (staff tools may still use this service)."
      >
        <label className="flex h-[50px] items-center gap-s2">
          <input
            type="checkbox"
            name="publicVisible"
            value="1"
            defaultChecked={values.publicVisible ?? initial?.publicVisible ?? true}
            className="h-[18px] w-[18px] cursor-pointer accent-accent"
          />
          <span className="t-body-md text-ink-soft">Visible on public booking</span>
        </label>
      </FormField>

      <FormField
        label="Booking policy"
        error={fieldErrors.bookingPolicy}
        hint={
          BOOKING_POLICIES.find((p) => p.value === bookingPolicy)?.hint ?? ''
        }
      >
        <Select
          name="bookingPolicy"
          defaultValue={bookingPolicy}
          className="w-full max-w-md"
        >
          {BOOKING_POLICIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Description"
        error={fieldErrors.description}
        hint="Optional. Longer description for staff or internal use."
      >
        <Textarea
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={values.description ?? ''}
          error={Boolean(fieldErrors.description)}
        />
      </FormField>

      <FormField
        label="Short description"
        error={fieldErrors.descriptionShort}
        hint="Optional. Short line for catalog cards (max 500 characters)."
      >
        <Textarea
          name="descriptionShort"
          rows={2}
          maxLength={500}
          defaultValue={values.descriptionShort ?? ''}
          error={Boolean(fieldErrors.descriptionShort)}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Duration (minutes)"
          required
          error={fieldErrors.durationMinutes}
          hint="Booking grid snaps to this. Whole minutes only."
        >
          <Input
            type="number"
            name="durationMinutes"
            inputMode="numeric"
            min={1}
            max={1440}
            step={1}
            required
            defaultValue={values.durationMinutes ?? ''}
            error={Boolean(fieldErrors.durationMinutes)}
          />
        </FormField>

        <FormField
          label="Base price (USD)"
          required
          error={fieldErrors.basePriceDollars}
          hint="Stored as cents server-side. Two decimals."
        >
          <Input
            type="number"
            name="basePriceDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            required
            defaultValue={values.basePriceDollars ?? ''}
            error={Boolean(fieldErrors.basePriceDollars)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Buffer before (minutes)"
          error={fieldErrors.bufferBeforeMinutes}
          hint="Prep / turnaround before this service starts (availability)."
        >
          <Input
            type="number"
            name="bufferBeforeMinutes"
            inputMode="numeric"
            min={0}
            max={1440}
            step={1}
            defaultValue={
              values.bufferBeforeMinutes ??
              (initial?.bufferBeforeMinutes !== undefined
                ? initial.bufferBeforeMinutes
                : '0')
            }
          />
        </FormField>

        <FormField
          label="Buffer after (minutes)"
          error={fieldErrors.bufferAfterMinutes}
          hint="Cleanup / spacing after this service ends (availability)."
        >
          <Input
            type="number"
            name="bufferAfterMinutes"
            inputMode="numeric"
            min={0}
            max={1440}
            step={1}
            defaultValue={
              values.bufferAfterMinutes ??
              (initial?.bufferAfterMinutes !== undefined
                ? initial.bufferAfterMinutes
                : '0')
            }
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Color"
          error={fieldErrors.color}
          hint="Used on the calendar and the public booking flow."
        >
          <ServiceColorPicker
            name="color"
            defaultValue={values.color ?? ''}
            error={Boolean(fieldErrors.color)}
            presets={presets}
          />
        </FormField>

        <FormField label="Active (bookable)" error={fieldErrors.active}>
          <label className="flex h-[50px] items-center gap-s2">
            <input
              type="checkbox"
              name="active"
              value="1"
              defaultChecked={values.active ?? true}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Bookable on the public schedule
            </span>
          </label>
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Staff who can perform this service</legend>
        {staff.length === 0 ? (
          <p className="t-body-sm text-ink-soft">
            No staff exist yet. Create some on the Staff page first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-s2 md:grid-cols-2">
            {staff.map((s) => {
              const fullName = `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`;
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-s2 rounded-sm px-s2 py-s1 transition-colors duration-fast hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    name="staffIds"
                    value={s.id}
                    defaultChecked={initialStaffIds.has(s.id)}
                    className="h-[18px] w-[18px] cursor-pointer accent-accent"
                  />
                  <span className="flex flex-col">
                    <span className="t-body-md text-ink">{fullName}</span>
                    {s.jobTitle && (
                      <span className="t-caption text-ink-soft">{s.jobTitle}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {fieldErrors.staffIds && (
          <span className="t-caption text-red font-sans">{fieldErrors.staffIds}</span>
        )}
      </fieldset>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
