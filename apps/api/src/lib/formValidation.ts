// Server-side form validator for the PR 7 public completion flow.
//
// Mirrors the client-side validator at
//   apps/web/app/forms/[token]/_components/_validation.ts
// Keep both in sync — duplication is intentional. Sharing JS across api
// (Node) and web (Edge-able Next.js) requires a packages/shared module
// promotion, which is out of scope for PR 7. Both files implement the
// same rule set with the same semantics.
//
// Validation skips fields whose `visibility` evaluation returns false
// against the supplied answers map. Required+empty fails. Type-specific
// rules from `field.validation` are honored (min/max for numbers, length
// for text, regex pattern for text, email format for email).
//
// Signature presence is checked separately by the caller (the route)
// because that requires inspecting the full schema + the signatureData
// blob — handled inline in the submit route.

type Json = unknown;

type FieldOption = { value: string; label: string };

type FieldValidation = {
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  maxFileSizeMb?: number;
  acceptedMimeTypes?: string[];
};

type VisibilityOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_truthy'
  | 'is_falsy';

type VisibilityRule = {
  fieldId: string;
  operator: VisibilityOperator;
  value?: string | number | boolean | string[];
};

type VisibilityConfig = {
  rules: VisibilityRule[];
};

export type FormFieldShape = {
  id: string;
  type: string;
  sectionId: string | null;
  label: string;
  required?: boolean;
  internalKey: string;
  order: number;
  options?: FieldOption[];
  validation?: FieldValidation;
  visibility?: VisibilityConfig;
};

export type FormSchemaShape = {
  schemaVersion?: 2;
  sections?: Array<{ id: string; title: string; order: number }>;
  fields?: FormFieldShape[];
};

export interface FieldError {
  fieldId: string;
  internalKey: string;
  message: string;
}

// ---- Visibility (mirrors apps/web _visibility-utils.ts) ----

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  return true;
}

function scalarEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = typeof a === 'number' ? a : Number(a);
    const nb = typeof b === 'number' ? b : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return String(a) === String(b);
  }
  return String(a) === String(b);
}

function evaluateRule(
  rule: VisibilityRule,
  answers: Record<string, unknown>,
  fields: FormFieldShape[],
): boolean {
  const watched = fields.find((f) => f.id === rule.fieldId);
  if (!watched) return true; // orphan rule — treat as satisfied
  const current = answers[rule.fieldId];

  switch (rule.operator) {
    case 'is_truthy':
      return isFilled(current);
    case 'is_falsy':
      return !isFilled(current);
    case 'equals':
      if (Array.isArray(current)) {
        return current.some((v) => scalarEquals(v, rule.value));
      }
      return scalarEquals(current, rule.value);
    case 'not_equals':
      if (Array.isArray(current)) {
        return !current.some((v) => scalarEquals(v, rule.value));
      }
      return !scalarEquals(current, rule.value);
    case 'contains':
      if (Array.isArray(current)) {
        return current.some((v) => scalarEquals(v, rule.value));
      }
      if (current == null || rule.value == null) return false;
      return String(current).includes(String(rule.value));
    case 'not_contains':
      if (Array.isArray(current)) {
        return !current.some((v) => scalarEquals(v, rule.value));
      }
      if (current == null || rule.value == null) return true;
      return !String(current).includes(String(rule.value));
    default:
      return true;
  }
}

export function isFieldVisible(
  field: FormFieldShape,
  answers: Record<string, unknown>,
  allFields: FormFieldShape[],
): boolean {
  const visibility = field.visibility;
  if (!visibility || !Array.isArray(visibility.rules) || visibility.rules.length === 0) {
    return true;
  }
  for (const rule of visibility.rules) {
    if (!evaluateRule(rule, answers, allFields)) return false;
  }
  return true;
}

// ---- Per-field emptiness ----

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
    // Stored as { mediaAssetId, fileName, ... } once uploaded.
    if (!value || typeof value !== 'object') return true;
    const obj = value as Record<string, unknown>;
    return typeof obj.mediaAssetId !== 'string' || obj.mediaAssetId.length === 0;
  }
  if (type === 'signature') {
    // Signature is captured at submit time via the dedicated payload; we
    // don't gate via per-field answers here.
    return false;
  }
  if (typeof value === 'string') return value.trim().length === 0;
  return value === undefined || value === null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateField(field: FormFieldShape, value: unknown): string | null {
  if (field.required && isEmpty(value, field.type)) {
    return 'Required.';
  }
  if (isEmpty(value, field.type)) return null; // optional + empty = OK

  const v = field.validation ?? {};

  if (field.type === 'email' && typeof value === 'string') {
    if (!EMAIL_RE.test(value.trim())) {
      return 'Enter a valid email address.';
    }
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
          const re = new RegExp(v.pattern);
          if (!re.test(value)) return 'Invalid format.';
        } catch {
          // Invalid pattern in schema — ignore rather than fail validation.
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

/**
 * Validate a submission's answers against the (normalized) form schema.
 * Returns a list of {fieldId, internalKey, message} errors. Empty list
 * means the answers pass.
 *
 * Visibility-hidden fields are skipped entirely (they don't exist from
 * the user's POV).
 */
export function validateAnswers(
  schema: FormSchemaShape,
  answers: Record<string, unknown>,
): FieldError[] {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const errors: FieldError[] = [];
  for (const field of fields) {
    if (!isFieldVisible(field, answers, fields)) continue;
    const err = validateField(field, answers[field.id]);
    if (err) {
      errors.push({
        fieldId: field.id,
        internalKey: field.internalKey,
        message: err,
      });
    }
  }
  return errors;
}

/**
 * True if the schema has at least one visible signature field. Used by the
 * submit route to decide whether signatureData must be present in the body.
 */
export function schemaRequiresSignature(
  schema: FormSchemaShape,
  answers: Record<string, unknown>,
): boolean {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  for (const field of fields) {
    if (field.type !== 'signature') continue;
    if (isFieldVisible(field, answers, fields)) return true;
  }
  return false;
}

// Helper for the route — turn the JSON schema column into a typed shape.
// Tolerant of legacy array shapes (returns empty fields). The PR 7 flow only
// ships against new-shape schemas, but the helper stays defensive.
export function coerceSchema(raw: Json): FormSchemaShape {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.schemaVersion === 2 && Array.isArray(obj.fields)) {
      return obj as FormSchemaShape;
    }
  }
  return { schemaVersion: 2, sections: [], fields: [] };
}
