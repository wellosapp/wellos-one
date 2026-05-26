'use client';

import { useMemo, useState } from 'react';

import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  fieldsInSection,
  orderedSections,
  type FormBuilderSchema,
  type FormField as FormFieldT,
} from '../_schema-utils';
import { evaluateVisibility } from '../_visibility-utils';

interface FormPreviewRendererProps {
  schema: FormBuilderSchema;
  initialValues?: Record<string, unknown>;
  /** Disables inputs — for "show me the shape" use cases. */
  readOnly?: boolean;
  /**
   * Rendered as a disabled "Submit (preview only)" button when present in the
   * preview modal. PR 7 will reuse this renderer with a real onSubmit.
   */
  onSubmit?: (values: Record<string, unknown>) => void;
}

// Lightweight read-mostly renderer. Visibility rules ACTUALLY evaluate as the
// user types so the admin can verify their logic. No submission, no
// validation — strictly a preview. PR 7 wires this same component into the
// client-facing magic-link page with real submission + validation on top.
export function FormPreviewRenderer({
  schema,
  initialValues,
  readOnly = false,
  onSubmit,
}: FormPreviewRendererProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    initialValues ?? {},
  );

  const sections = useMemo(() => orderedSections(schema), [schema]);
  const topLevel = useMemo(() => fieldsInSection(schema, null), [schema]);

  const setValue = (fieldId: string, next: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: next }));
  };

  function renderField(field: FormFieldT) {
    const visible = evaluateVisibility(field.visibility, values, schema.fields);
    if (!visible) return null;
    return (
      <FieldRow
        key={field.id}
        field={field}
        value={values[field.id]}
        onChange={(v) => setValue(field.id, v)}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div className="flex flex-col gap-s5">
      {topLevel.length > 0 ? (
        <div className="flex flex-col gap-s4">
          {topLevel.map((f) => renderField(f))}
        </div>
      ) : null}

      {sections.map((s) => {
        const fields = fieldsInSection(schema, s.id);
        return (
          <Card
            key={s.id}
            padding="lg"
            className="rounded-lg border border-surface-3 bg-white shadow-sm"
          >
            <h3 className="t-display-md text-ink">
              {s.title || 'Untitled section'}
            </h3>
            {s.description ? (
              <p className="mt-s2 t-body-sm text-ink-soft">{s.description}</p>
            ) : null}
            <div className="mt-s4 flex flex-col gap-s4">
              {fields.map((f) => renderField(f))}
            </div>
          </Card>
        );
      })}

      {topLevel.length === 0 && sections.length === 0 ? (
        <p className="rounded-md border border-dashed border-surface-3 bg-surface-2/40 px-s5 py-s5 text-center t-body-md text-ink-soft">
          This form has no fields yet.
        </p>
      ) : null}

      {onSubmit ? (
        <div className="flex justify-end">
          <Button type="button" variant="accent" disabled>
            Submit (preview only)
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// One labelled field row + its input widget. Splitting this out keeps the
// renderer above readable and centralises label/helper/required markup.
function FieldRow({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FormFieldT;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col gap-s2">
      <label className="t-body-md font-medium text-ink">
        {field.label || 'Untitled field'}
        {field.required ? <span className="text-red"> *</span> : null}
      </label>
      <FieldInput
        field={field}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
      />
      {field.helperText ? (
        <p className="t-caption text-ink-soft">{field.helperText}</p>
      ) : null}
    </div>
  );
}

// Type-dispatch on `field.type`. Inputs are minimal — they call onChange
// with primitive values that round-trip cleanly through `evaluateVisibility`.
function FieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FormFieldT;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const baseInput = cn(
    'w-full bg-white text-ink font-sans text-[16px]',
    'border-[1.5px] rounded-md border-surface-3',
    'px-s4 py-[13px]',
    'transition-[border-color,box-shadow] duration-fast',
    'placeholder:text-placeholder',
    'focus:outline-none focus:shadow-focus focus:border-accent',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  );

  switch (field.type) {
    case 'short_text':
    case 'phone':
    case 'email':
      return (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          className={baseInput}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case 'long_text':
      return (
        <textarea
          rows={4}
          className={cn(baseInput, 'resize-y')}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          className={baseInput}
          value={
            typeof value === 'number'
              ? value
              : typeof value === 'string'
              ? value
              : ''
          }
          placeholder={field.placeholder ?? ''}
          min={field.validation?.min}
          max={field.validation?.max}
          step={field.validation?.step}
          onChange={(e) =>
            onChange(e.target.value === '' ? '' : Number(e.target.value))
          }
          disabled={readOnly}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className={baseInput}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case 'yes_no': {
      const v = value === 'yes' || value === true ? 'yes' : value === 'no' || value === false ? 'no' : '';
      return (
        <div
          role="radiogroup"
          aria-label={field.label}
          className="inline-flex overflow-hidden rounded-md border border-surface-3"
        >
          {(['yes', 'no'] as const).map((opt) => {
            const selected = v === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !readOnly && onChange(opt)}
                disabled={readOnly}
                className={cn(
                  'px-s5 py-[10px] t-body-md transition-colors duration-fast',
                  selected
                    ? 'bg-sage text-white'
                    : 'bg-white text-ink hover:bg-surface-2',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  readOnly && 'opacity-50 cursor-not-allowed',
                )}
              >
                {opt === 'yes' ? 'Yes' : 'No'}
              </button>
            );
          })}
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className="inline-flex cursor-pointer items-center gap-s2 t-body-md text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-sage-deep"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={readOnly}
          />
          <span>{field.placeholder ?? 'I agree'}</span>
        </label>
      );
    case 'multi_select': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-s2">
          {(field.options ?? []).map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label
                key={o.value}
                className="inline-flex cursor-pointer items-center gap-s2 t-body-md text-ink"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sage-deep"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? Array.from(new Set([...arr, o.value]))
                      : arr.filter((v) => v !== o.value);
                    onChange(next);
                  }}
                  disabled={readOnly}
                />
                <span>{o.label || o.value}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case 'dropdown':
      return (
        <select
          className={cn(baseInput, 'appearance-none pr-[44px]')}
          style={{ colorScheme: 'light' }}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        >
          <option value="">{field.placeholder ?? 'Select…'}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="flex flex-col gap-s2">
          {(field.options ?? []).map((o) => (
            <label
              key={o.value}
              className="inline-flex cursor-pointer items-center gap-s2 t-body-md text-ink"
            >
              <input
                type="radio"
                name={`preview-${field.id}`}
                className="h-4 w-4 accent-sage-deep"
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                disabled={readOnly}
              />
              <span>{o.label || o.value}</span>
            </label>
          ))}
        </div>
      );
    case 'rating': {
      const max = field.validation?.max ?? 5;
      const current = typeof value === 'number' ? value : 0;
      return (
        <div className="flex items-center gap-s1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
            const filled = n <= current;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} of ${max}`}
                onClick={() => !readOnly && onChange(n)}
                disabled={readOnly}
                className={cn(
                  'rounded-md p-s1 transition-colors duration-fast',
                  filled ? 'text-amber' : 'text-ink-soft/40',
                  !readOnly && 'hover:text-amber',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                )}
              >
                <StarGlyph filled={filled} />
              </button>
            );
          })}
        </div>
      );
    }
    case 'pain_scale': {
      const min = field.validation?.min ?? 0;
      const max = field.validation?.max ?? 10;
      const current = typeof value === 'number' ? value : null;
      const values: number[] = [];
      for (let i = min; i <= max; i += 1) values.push(i);
      return (
        <div className="flex flex-wrap gap-s1">
          {values.map((n) => {
            const selected = current === n;
            // Gradient: low (sage) -> mid (amber) -> high (red)
            const ratio = max === min ? 0 : (n - min) / (max - min);
            const baseTone =
              ratio < 0.34
                ? 'bg-green-pale text-green'
                : ratio < 0.67
                ? 'bg-amber-pale text-amber'
                : 'bg-red-pale text-red';
            return (
              <button
                key={n}
                type="button"
                aria-label={`Pain ${n}`}
                onClick={() => !readOnly && onChange(n)}
                disabled={readOnly}
                className={cn(
                  'h-9 w-9 rounded-md text-[13px] font-semibold transition-all duration-fast',
                  baseTone,
                  selected ? 'ring-[1.5px] ring-accent' : 'opacity-70 hover:opacity-100',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  readOnly && 'opacity-50 cursor-not-allowed',
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      );
    }
    case 'signature':
      return (
        <div className="rounded-md border-[1.5px] border-dashed border-surface-3 bg-surface-2/40 px-s4 py-s5 text-center t-caption text-ink-soft">
          Signature pad — interactive in PR 7
        </div>
      );
    case 'file_upload':
    case 'image_upload':
      return (
        <div className="rounded-md border-[1.5px] border-dashed border-surface-3 bg-surface-2/40 px-s4 py-s5 text-center t-caption text-ink-soft">
          {field.type === 'image_upload' ? 'Image upload' : 'File upload'} —
          interactive in PR 7
        </div>
      );
    default:
      return null;
  }
}

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8L6.6 19.7l1-6L3.2 9.4l6.1-.9z" />
    </svg>
  );
}
