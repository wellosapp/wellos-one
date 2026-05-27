'use client';

// Public form field renderer for PR 7 of the Forms System epic.
//
// Distinct from apps/web/app/admin/intake-forms/builder/FormPreviewRenderer
// (admin preview) and apps/web/components/forms/FormFieldRenderer (staff
// onboarding). Per CLAUDE.md hard rule #15, this is NOT a parallel V2 — it
// renders a DIFFERENT surface (the public client-facing flow) with
// additional concerns the preview doesn't have:
//   - signature canvas capture (deferred to SSR-false dynamic import)
//   - file upload with progress / placeholder when feature-flagged off
//   - per-field validation errors inline
//   - controlled by an external answers map with autosave debouncing
// Sharing one component across all three surfaces would balloon its API.

import dynamic from 'next/dynamic';
import type { ChangeEvent } from 'react';

import type {
  FormField as FormFieldT,
} from '@/app/admin/intake-forms/_schema-utils';
import { cn } from '@/lib/cn';

// react-signature-canvas needs the browser canvas — SSR off.
const SignaturePad = dynamic(() => import('./SignaturePad'), {
  ssr: false,
  loading: () => (
    <div className="h-[180px] rounded-md border-[1.5px] border-dashed border-surface-3 bg-surface-2/40 grid place-items-center t-caption text-ink-soft">
      Loading signature pad…
    </div>
  ),
});

export interface FormFieldRendererProps {
  field: FormFieldT;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Captured by the parent and merged into the submit payload's signatureData. */
  onSignatureChange?: (imageBase64: string | null) => void;
  /** Restored signature from a prior autosave (rare — usually null). */
  initialSignatureBase64?: string | null;
  error?: string | null;
  disabled?: boolean;
  /** Honors the FORMS_FILE_UPLOAD_ENABLED server feature flag. */
  fileUploadEnabled?: boolean;
}

export function FormFieldRenderer(props: FormFieldRendererProps) {
  const { field, error } = props;
  const fieldId = `f-${field.id}`;

  return (
    <div className="flex flex-col gap-s2">
      <label
        htmlFor={fieldId}
        className="t-body-md font-medium text-ink"
      >
        {field.label || 'Untitled field'}
        {field.required ? <span className="text-red"> *</span> : null}
      </label>
      <FieldInput {...props} fieldId={fieldId} />
      {field.helperText ? (
        <p className="t-caption text-ink-soft">{field.helperText}</p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="t-caption font-medium text-red"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FieldInput(
  props: FormFieldRendererProps & { fieldId: string },
) {
  const {
    field,
    value,
    onChange,
    onSignatureChange,
    initialSignatureBase64,
    disabled,
    fileUploadEnabled = false,
    fieldId,
    error,
  } = props;

  const inputClass = cn(
    'w-full bg-white text-ink font-sans text-[16px]',
    'border-[1.5px] rounded-md border-surface-3',
    'px-s4 py-[13px]',
    'transition-[border-color,box-shadow] duration-fast',
    'placeholder:text-placeholder',
    'focus:outline-none focus:shadow-focus focus:border-accent',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    error && 'border-red',
  );

  switch (field.type) {
    case 'short_text':
    case 'phone':
    case 'email':
      return (
        <input
          id={fieldId}
          type={
            field.type === 'email'
              ? 'email'
              : field.type === 'phone'
              ? 'tel'
              : 'text'
          }
          inputMode={
            field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'
          }
          autoComplete={
            field.type === 'email'
              ? 'email'
              : field.type === 'phone'
              ? 'tel'
              : undefined
          }
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? ''}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case 'long_text':
      return (
        <textarea
          id={fieldId}
          rows={5}
          className={cn(inputClass, 'resize-y min-h-[120px]')}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case 'number':
      return (
        <input
          id={fieldId}
          type="number"
          inputMode="decimal"
          className={inputClass}
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
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? '' : Number(raw));
          }}
          disabled={disabled}
        />
      );

    case 'date':
      return (
        <input
          id={fieldId}
          type="date"
          className={inputClass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case 'yes_no': {
      const current =
        value === 'yes' || value === true
          ? 'yes'
          : value === 'no' || value === false
          ? 'no'
          : '';
      return (
        <div
          role="radiogroup"
          aria-label={field.label}
          className="grid grid-cols-2 gap-s2"
        >
          {(['yes', 'no'] as const).map((opt) => {
            const selected = current === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !disabled && onChange(opt)}
                disabled={disabled}
                className={cn(
                  'rounded-md border-[1.5px] px-s5 py-[12px] t-body-md transition-colors duration-fast',
                  selected
                    ? 'bg-sage text-white border-sage-deep'
                    : 'bg-white text-ink border-surface-3 hover:border-sage',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  disabled && 'opacity-50 cursor-not-allowed',
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
        <label className="inline-flex cursor-pointer items-center gap-s3 t-body-md text-ink">
          <input
            type="checkbox"
            className="h-5 w-5 accent-sage-deep"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{field.placeholder ?? 'I agree'}</span>
        </label>
      );

    case 'multi_select': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-s3">
          {(field.options ?? []).map((o) => {
            const checked = arr.includes(o.value);
            return (
              <label
                key={o.value}
                className="inline-flex cursor-pointer items-center gap-s3 t-body-md text-ink"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-sage-deep"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? Array.from(new Set([...arr, o.value]))
                      : arr.filter((v) => v !== o.value);
                    onChange(next);
                  }}
                  disabled={disabled}
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
          id={fieldId}
          className={cn(inputClass, 'appearance-none pr-[44px]')}
          style={{ colorScheme: 'light' }}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
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
        <div className="flex flex-col gap-s3">
          {(field.options ?? []).map((o) => (
            <label
              key={o.value}
              className="inline-flex cursor-pointer items-center gap-s3 t-body-md text-ink"
            >
              <input
                type="radio"
                name={`field-${field.id}`}
                className="h-5 w-5 accent-sage-deep"
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                disabled={disabled}
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
        <div className="flex items-center gap-s2">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
            const filled = n <= current;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} of ${max}`}
                onClick={() => !disabled && onChange(n)}
                disabled={disabled}
                className={cn(
                  'rounded-md p-s1 transition-colors duration-fast',
                  filled ? 'text-amber' : 'text-ink-soft/40',
                  !disabled && 'hover:text-amber',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  disabled && 'opacity-50 cursor-not-allowed',
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
        <div className="grid grid-cols-6 gap-s2 sm:grid-cols-11">
          {values.map((n) => {
            const selected = current === n;
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
                onClick={() => !disabled && onChange(n)}
                disabled={disabled}
                className={cn(
                  'h-12 rounded-md text-[15px] font-semibold transition-all duration-fast',
                  baseTone,
                  selected ? 'ring-[1.5px] ring-accent' : 'opacity-80 hover:opacity-100',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  disabled && 'opacity-50 cursor-not-allowed',
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
        <SignaturePad
          onChange={(img) => onSignatureChange?.(img)}
          disabled={disabled}
          initialBase64={initialSignatureBase64 ?? null}
          ariaLabel={field.label}
        />
      );

    case 'file_upload':
    case 'image_upload':
      // File upload feature flag — when off, render a calm placeholder so
      // the form is still completable. Required + flag-off is a degraded
      // state surfaced by validation only when the user tries to submit.
      if (!fileUploadEnabled) {
        return (
          <div className="rounded-md border-[1.5px] border-dashed border-surface-3 bg-surface-2/40 px-s4 py-s5 text-center t-caption text-ink-soft">
            {field.type === 'image_upload' ? 'Image' : 'File'} uploads will
            be available soon. Ask your provider for next steps if this is
            required.
          </div>
        );
      }
      // Flag-on path — placeholder until the file route is wired (it's a
      // 501 today). Wired in the file-upload follow-up PR.
      return (
        <div className="rounded-md border-[1.5px] border-dashed border-surface-3 bg-surface-2/40 px-s4 py-s5 text-center t-caption text-ink-soft">
          {field.type === 'image_upload' ? 'Image upload' : 'File upload'} — wiring lands in a follow-up PR.
        </div>
      );

    default:
      return null;
  }
}

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width={28}
      height={28}
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
