// Client-side form validator for PR 7's public completion flow.
//
// Mirrors apps/api/src/lib/formValidation.ts. Keep both in sync — pure
// duplication is the chosen tradeoff (over a packages/shared promotion)
// for this PR. Both implement the same rules with the same semantics:
//
//   - skip fields hidden by visibility rules
//   - required + empty → "Required."
//   - email format check
//   - text minLength / maxLength / pattern
//   - number / rating / pain_scale min / max
//   - dropdown / radio: value must be in options
//   - multi_select: every value must be in options
//   - file_upload / image_upload: required iff a mediaAssetId is missing
//   - signature: presence checked at submit time (separate payload)

import type {
  FormBuilderSchema,
  FormField,
} from '@/app/admin/intake-forms/_schema-utils';
import { evaluateVisibility } from '@/app/admin/intake-forms/_visibility-utils';

export type FieldError = {
  fieldId: string;
  internalKey: string;
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(value: unknown, type: string): boolean {
  if (type === 'multi_select') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (type === 'yes_no') {
    return value !== true && value !== false && value !== 'yes' && value !== 'no';
  }
  if (type === 'checkbox') {
    return value !== true;
  }
  if (type === 'number' || type === 'rating' || type === 'pain_scale') {
    if (typeof value === 'number') return Number.isNaN(value);
    if (typeof value === 'string') return value.trim().length === 0;
    return value === undefined || value === null;
  }
  if (type === 'file_upload' || type === 'image_upload') {
    if (!value || typeof value !== 'object') return true;
    const obj = value as Record<string, unknown>;
    return typeof obj.mediaAssetId !== 'string' || obj.mediaAssetId.length === 0;
  }
  if (type === 'signature') {
    // Captured via the signatureData payload, not the answers map.
    return false;
  }
  if (typeof value === 'string') return value.trim().length === 0;
  return value === undefined || value === null;
}

function validateField(field: FormField, value: unknown): string | null {
  if (field.required && isEmpty(value, field.type)) {
    return 'Required.';
  }
  if (isEmpty(value, field.type)) return null;

  const v = field.validation ?? {};

  if (field.type === 'email' && typeof value === 'string') {
    if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
  }

  if (
    field.type === 'short_text' ||
    field.type === 'long_text' ||
    field.type === 'phone' ||
    field.type === 'email'
  ) {
    if (typeof value === 'string') {
      if (v.minLength !== undefined && value.length < v.minLength) {
        return `Must be at least ${v.minLength} characters.`;
      }
      if (v.maxLength !== undefined && value.length > v.maxLength) {
        return `Must be at most ${v.maxLength} characters.`;
      }
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(value)) return 'Invalid format.';
        } catch {
          // Bad pattern in schema — ignore.
        }
      }
    }
  }

  if (field.type === 'number' || field.type === 'rating' || field.type === 'pain_scale') {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return 'Enter a number.';
    if (v.min !== undefined && n < v.min) return `Must be at least ${v.min}.`;
    if (v.max !== undefined && n > v.max) return `Must be at most ${v.max}.`;
  }

  if (field.type === 'dropdown' || field.type === 'radio') {
    const allowed = (field.options ?? []).map((o) => o.value);
    if (typeof value === 'string' && !allowed.includes(value)) {
      return 'Choose one of the available options.';
    }
  }
  if (field.type === 'multi_select') {
    const allowed = new Set((field.options ?? []).map((o) => o.value));
    if (Array.isArray(value)) {
      for (const v_ of value) {
        if (typeof v_ !== 'string' || !allowed.has(v_)) {
          return 'Choose from the available options.';
        }
      }
    }
  }

  return null;
}

export function validateFields(
  fields: FormField[],
  answers: Record<string, unknown>,
  allFields: FormField[],
): FieldError[] {
  const out: FieldError[] = [];
  for (const field of fields) {
    if (!evaluateVisibility(field.visibility, answers, allFields)) continue;
    const err = validateField(field, answers[field.id]);
    if (err) {
      out.push({
        fieldId: field.id,
        internalKey: field.internalKey,
        message: err,
      });
    }
  }
  return out;
}

export function validateAllVisible(
  schema: FormBuilderSchema,
  answers: Record<string, unknown>,
): FieldError[] {
  return validateFields(schema.fields, answers, schema.fields);
}

export function schemaHasVisibleSignature(
  schema: FormBuilderSchema,
  answers: Record<string, unknown>,
): boolean {
  for (const field of schema.fields) {
    if (field.type !== 'signature') continue;
    if (evaluateVisibility(field.visibility, answers, schema.fields)) return true;
  }
  return false;
}
