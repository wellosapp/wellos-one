'use client';

// Brand palette editor (Phase 1 of Brand Settings). Tenant-scoped list of
// { name, hex } objects. Reuses ServiceColorPicker for the hex chip + custom
// popover so the visual language is consistent with the service form.
//
// Submits the full array as a single hidden `brandColorsJson` form field;
// the server action parses, validates, and forwards to PATCH /admin/tenant/brand.
//
// React 18: useFormState/useFormStatus from 'react-dom'. NEVER useActionState
// from 'react' — that's React 19 only.

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { ServiceColorPicker } from '@/app/admin/services/ServiceColorPicker';
import type { BrandColor } from '@/app/admin/services/_constants/colors';
import { Alert, Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { BrandSettingsActionState } from './_actions';

type Props = {
  initialColors: BrandColor[];
  fallbackColors: BrandColor[];
  action: (
    prev: BrandSettingsActionState,
    formData: FormData,
  ) => Promise<BrandSettingsActionState>;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// Cap matches the backend Zod schema (z.array(...).max(24)).
const MAX_COLORS = 24;

// Field names for a single row. The ServiceColorPicker writes its current
// hex into a hidden text input named `hex-${i}`; the name input is wired
// to `name-${i}`. The action assembles all rows into a JSON array.
function rowNameField(i: number) {
  return `brand-color-name-${i}`;
}
function rowHexField(i: number) {
  return `brand-color-hex-${i}`;
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
      {pending ? 'Saving…' : 'Save palette'}
    </Button>
  );
}

function rowsAreValid(colors: BrandColor[]): boolean {
  if (colors.length === 0) return true;
  return colors.every(
    (c) => c.name.trim().length > 0 && HEX_RE.test(c.hex),
  );
}

export function BrandColorsEditor({
  initialColors,
  fallbackColors,
  action,
}: Props) {
  const [state, formAction] = useFormState<BrandSettingsActionState, FormData>(
    action,
    { ok: false },
  );

  // Local state seeds the inputs; we don't re-sync from the action's
  // returned state because the action only echoes back ok/error, not values.
  const [colors, setColors] = useState<BrandColor[]>(initialColors);

  // Per-row validation only needs to know "has the user typed a non-empty
  // name" — the hex comes from the picker (always a valid hex once they
  // pick one). Empty hex = "they haven't picked anything yet."
  const valid = rowsAreValid(colors);

  function updateName(index: number, name: string) {
    setColors((current) =>
      current.map((c, i) => (i === index ? { ...c, name } : c)),
    );
  }

  function removeRow(index: number) {
    setColors((current) => current.filter((_, i) => i !== index));
  }

  function addRow() {
    if (colors.length >= MAX_COLORS) return;
    setColors((current) => [...current, { name: '', hex: '' }]);
  }

  function resetToDefaults() {
    setColors([...fallbackColors]);
  }

  // Server-action wrapper: walk the FormData and reassemble the array.
  // ServiceColorPicker's hidden input contains the current hex per row;
  // the name input is our own. We don't trust our React state for the hex
  // (the picker owns that) so we read it from FormData.
  async function handleSubmit(formData: FormData) {
    const assembled: BrandColor[] = [];
    for (let i = 0; i < colors.length; i++) {
      const name = String(formData.get(rowNameField(i)) ?? '').trim();
      const hex = String(formData.get(rowHexField(i)) ?? '').trim().toUpperCase();
      assembled.push({ name, hex });
    }
    formData.set('brandColorsJson', JSON.stringify(assembled));
    formAction(formData);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-s5">
      {state.ok && <Alert tone="success">Brand palette saved.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {colors.length === 0 ? (
        <p className="t-body-md text-ink-soft">
          No colors yet. Add at least one or reset to the Wellos defaults.
        </p>
      ) : (
        <ul className="flex flex-col gap-s3">
          {colors.map((color, i) => (
            <li
              key={i}
              className={cn(
                'flex flex-col gap-s3 rounded-md border border-line bg-surface-2 p-s4',
                'md:flex-row md:items-end',
              )}
            >
              <div className="flex flex-1 flex-col gap-s1">
                <label
                  htmlFor={rowNameField(i)}
                  className="t-caption text-ink-soft"
                >
                  Name
                </label>
                <Input
                  id={rowNameField(i)}
                  name={rowNameField(i)}
                  type="text"
                  value={color.name}
                  maxLength={50}
                  onChange={(e) => updateName(i, e.target.value)}
                  error={!color.name.trim()}
                  placeholder="e.g. Sage"
                />
              </div>

              <div className="flex flex-1 flex-col gap-s1">
                <span className="t-caption text-ink-soft">Color</span>
                {/* ServiceColorPicker renders a hidden <input name={name}>
                    containing the current hex. We pull it out of FormData on
                    submit — no DOM-bridging needed. */}
                <ServiceColorPicker
                  name={rowHexField(i)}
                  defaultValue={color.hex}
                  error={!HEX_RE.test(color.hex)}
                  presets={fallbackColors}
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => removeRow(i)}
                  className="text-red hover:bg-red-pale"
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-s3">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={addRow}
          disabled={colors.length >= MAX_COLORS}
        >
          + Add color
        </Button>

        <div className="flex items-center gap-s2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={resetToDefaults}
          >
            Reset to defaults
          </Button>
          <SaveButton disabled={!valid} />
        </div>
      </div>
    </form>
  );
}
