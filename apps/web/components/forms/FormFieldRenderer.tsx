'use client';

import { FormField, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

// Reusable renderer for ONE field in a form-fill-out flow. Used by both staff
// onboarding (W9, license, certs) and client intake. The renderer is value-
// agnostic — the parent (FormFillPanel) holds the answers map and pipes each
// field's slice in via `value` + `onChange`.

export type FormFieldType =
  | 'text'
  | 'long_text'
  | 'date'
  | 'yes_no'
  | 'multi_select'
  | 'signature'
  | 'file_upload';

export type FormFieldConfig = {
  key: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  options?: string[];
};

export type FormFieldRendererProps = {
  field: FormFieldConfig;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled?: boolean;
  error?: string;
};

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asBoolean(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

export function FormFieldRenderer({
  field,
  value,
  onChange,
  disabled,
  error,
}: FormFieldRendererProps) {
  const inputId = `field-${field.key}`;

  switch (field.type) {
    case 'text': {
      return (
        <FormField
          label={field.label}
          htmlFor={inputId}
          required={field.required}
          error={error}
        >
          <Input
            id={inputId}
            type="text"
            value={asString(value)}
            disabled={disabled}
            error={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      );
    }

    case 'long_text': {
      return (
        <FormField
          label={field.label}
          htmlFor={inputId}
          required={field.required}
          error={error}
        >
          <Textarea
            id={inputId}
            value={asString(value)}
            disabled={disabled}
            error={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      );
    }

    case 'date': {
      return (
        <FormField
          label={field.label}
          htmlFor={inputId}
          required={field.required}
          error={error}
        >
          <Input
            id={inputId}
            type="date"
            value={asString(value)}
            disabled={disabled}
            error={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      );
    }

    case 'yes_no': {
      const current = asBoolean(value);
      return (
        <FormField
          label={field.label}
          required={field.required}
          error={error}
        >
          <div className="flex gap-s2">
            <YesNoButton
              active={current === true}
              disabled={disabled}
              onClick={() => onChange(true)}
            >
              Yes
            </YesNoButton>
            <YesNoButton
              active={current === false}
              disabled={disabled}
              onClick={() => onChange(false)}
            >
              No
            </YesNoButton>
          </div>
        </FormField>
      );
    }

    case 'multi_select': {
      const selected = asStringArray(value);
      const options = field.options ?? [];
      return (
        <FormField
          label={field.label}
          required={field.required}
          error={error}
        >
          <div className="flex flex-col gap-s2">
            {options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className={cn(
                    'flex cursor-pointer items-center gap-s2 t-body-md text-ink',
                    disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt]
                        : selected.filter((s) => s !== opt);
                      onChange(next);
                    }}
                    className="h-4 w-4 accent-sage-deep"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        </FormField>
      );
    }

    case 'signature': {
      return (
        <FormField
          label={field.label}
          htmlFor={inputId}
          required={field.required}
          error={error}
          hint="Type your full legal name. Acts as legal signature."
        >
          <Input
            id={inputId}
            type="text"
            value={asString(value)}
            disabled={disabled}
            error={Boolean(error)}
            onChange={(e) => onChange(e.target.value)}
          />
        </FormField>
      );
    }

    case 'file_upload': {
      return (
        <FormField
          label={field.label}
          htmlFor={inputId}
          required={field.required}
          hint="Coming soon — file upload field type lands in a follow-up. Use the Files tab to attach documents for now."
        >
          <Input id={inputId} type="text" value="" disabled />
        </FormField>
      );
    }

    default: {
      // Exhaustiveness sanity — surfaces unknown types in dev.
      const _exhaustive: never = field.type;
      void _exhaustive;
      return null;
    }
  }
}

function YesNoButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-w-[80px] items-center justify-center rounded-md border px-s5 py-[10px]',
        't-body-md font-medium font-sans transition-[background-color,border-color] duration-fast',
        active
          ? 'border-sage-deep bg-sage-deep text-ink-inv'
          : 'border-surface-3 bg-surface text-ink hover:border-sage',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}
