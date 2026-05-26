// Shared types + pure helpers for the Forms-System builder schema.
//
// Two schemas live in this file:
//   1. The NEW shape produced by the visual builder (this PR — Forms PR 2).
//      An object with `schemaVersion: 2`, ordered `sections`, and a flat
//      `fields` list that points at sections via `sectionId`.
//   2. The OLD shape kept for backward-compat: a flat JSON array of
//      `{ key, type, label, required?, options? }` records. Produced by the
//      previous JSON editor (pre-Forms PR 2).
//
// `normalizeSchema` accepts either shape and always returns the new shape so
// the builder + submission viewer never see the legacy array.

import type { VisibilityConfig } from './_visibility-utils';

export type {
  VisibilityConfig,
  VisibilityRule,
  VisibilityOperator,
} from './_visibility-utils';

// ---------- New shape ----------

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'date'
  | 'yes_no'
  | 'checkbox'
  | 'multi_select'
  | 'dropdown'
  | 'radio'
  | 'number'
  | 'phone'
  | 'email'
  | 'signature'
  | 'file_upload'
  | 'image_upload'
  | 'rating'
  | 'pain_scale';

export type FieldOption = {
  value: string;
  label: string;
};

export type FieldValidation = {
  // Numeric (number, rating, pain_scale)
  min?: number;
  max?: number;
  step?: number;
  // Text (short_text, long_text)
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // File / image upload
  maxFileSizeMb?: number;
  acceptedMimeTypes?: string[];
};

export type FormField = {
  id: string;
  type: FieldType;
  sectionId: string | null;
  label: string;
  helperText?: string;
  placeholder?: string;
  required: boolean;
  internalKey: string;
  order: number;
  options?: FieldOption[];
  validation?: FieldValidation;
  // Conditional visibility — when undefined, field is always visible.
  // See `_visibility-utils.ts` for the rule shape + evaluator.
  visibility?: VisibilityConfig;
};

export type FormSection = {
  id: string;
  title: string;
  description?: string;
  order: number;
};

export type FormBuilderSchema = {
  schemaVersion: 2;
  sections: FormSection[];
  fields: FormField[];
};

// ---------- Field type metadata ----------

export const FIELD_TYPES: FieldType[] = [
  'short_text',
  'long_text',
  'date',
  'yes_no',
  'checkbox',
  'multi_select',
  'dropdown',
  'radio',
  'number',
  'phone',
  'email',
  'signature',
  'file_upload',
  'image_upload',
  'rating',
  'pain_scale',
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  date: 'Date',
  yes_no: 'Yes / no',
  checkbox: 'Checkbox',
  multi_select: 'Multi-select',
  dropdown: 'Dropdown',
  radio: 'Radio',
  number: 'Number',
  phone: 'Phone',
  email: 'Email',
  signature: 'Signature',
  file_upload: 'File upload',
  image_upload: 'Image upload',
  rating: 'Rating',
  pain_scale: 'Pain scale',
};

export const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
  short_text: 'Single-line text input.',
  long_text: 'Multi-line text area for paragraphs.',
  date: 'Calendar date picker.',
  yes_no: 'Single yes-or-no choice.',
  checkbox: 'One acknowledgement toggle.',
  multi_select: 'Multiple checkboxes — pick any number.',
  dropdown: 'Single-choice dropdown menu.',
  radio: 'Single-choice radio buttons.',
  number: 'Numeric input with optional min/max.',
  phone: 'Formatted phone number.',
  email: 'Email address with format check.',
  signature: 'Typed legal signature.',
  file_upload: 'Attach a document or PDF.',
  image_upload: 'Attach a photo or image.',
  rating: '1-5 star rating scale.',
  pain_scale: '0-10 pain or intensity scale.',
};

// ---------- ID generation ----------

// Stable client-side ID. Prefer crypto.randomUUID where available, fall back
// to a base-36 random string for older browsers / SSR contexts.
function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// ---------- Factories ----------

export function createEmptySection(): FormSection {
  return {
    id: generateId(),
    title: 'Untitled section',
    description: '',
    order: 0,
  };
}

export function createEmptyField(
  type: FieldType,
  sectionId: string | null = null,
): FormField {
  const base: FormField = {
    id: generateId(),
    type,
    sectionId,
    label: defaultLabelForType(type),
    required: false,
    internalKey: '', // assigned by caller via generateUniqueInternalKey
    order: 0,
  };
  if (type === 'dropdown' || type === 'radio' || type === 'multi_select') {
    base.options = [
      { value: 'option_1', label: 'Option 1' },
      { value: 'option_2', label: 'Option 2' },
    ];
  }
  if (type === 'rating') {
    base.validation = { max: 5 };
  } else if (type === 'pain_scale') {
    base.validation = { min: 0, max: 10 };
  }
  return base;
}

function defaultLabelForType(type: FieldType): string {
  return FIELD_TYPE_LABELS[type];
}

// ---------- internalKey utilities ----------

// snake_case identifier: lowercase ASCII, digits, underscore. Cannot start
// with a digit. 1-64 chars.
const INTERNAL_KEY_RE = /^[a-z_][a-z0-9_]{0,63}$/;

export function validateInternalKey(
  key: string,
): { ok: true } | { ok: false; error: string } {
  if (!key || key.length === 0) {
    return { ok: false, error: 'Internal key is required.' };
  }
  if (!INTERNAL_KEY_RE.test(key)) {
    return {
      ok: false,
      error:
        'Use lowercase letters, numbers, and underscores. Must start with a letter or underscore.',
    };
  }
  return { ok: true };
}

// Convert any label to a sensible snake_case base. Collapses runs of non-
// alphanumeric chars to a single underscore; trims leading/trailing
// underscores; ensures the first char is a letter (prefix `f_` if needed).
export function snakeCaseFromLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  const slug = lower
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  if (slug.length === 0) return 'field';
  if (/^[0-9]/.test(slug)) return `f_${slug}`;
  return slug;
}

// Returns the existing key if it's already unique, otherwise appends `_2`,
// `_3`, ... until a free slot is found. `excludeFieldId` lets the caller
// re-check an edited field against everyone except itself.
export function generateUniqueInternalKey(
  schema: FormBuilderSchema,
  base: string,
  excludeFieldId?: string,
): string {
  const taken = new Set(
    schema.fields
      .filter((f) => f.id !== excludeFieldId)
      .map((f) => f.internalKey),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// ---------- Old-shape detection + conversion ----------

type OldFieldType =
  | 'text'
  | 'short_text'
  | 'long_text'
  | 'date'
  | 'yes_no'
  | 'multi_select'
  | 'signature'
  | 'file_upload'
  | 'checkbox'
  | 'dropdown'
  | 'radio'
  | 'number'
  | 'phone'
  | 'email'
  | 'image_upload'
  | 'rating'
  | 'pain_scale';

const OLD_TYPE_TO_NEW: Record<OldFieldType, FieldType> = {
  // The legacy renderer's 'text' type maps to the new short_text.
  text: 'short_text',
  short_text: 'short_text',
  long_text: 'long_text',
  date: 'date',
  yes_no: 'yes_no',
  multi_select: 'multi_select',
  signature: 'signature',
  file_upload: 'file_upload',
  checkbox: 'checkbox',
  dropdown: 'dropdown',
  radio: 'radio',
  number: 'number',
  phone: 'phone',
  email: 'email',
  image_upload: 'image_upload',
  rating: 'rating',
  pain_scale: 'pain_scale',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNewShape(raw: unknown): raw is FormBuilderSchema {
  return (
    isObject(raw) &&
    raw.schemaVersion === 2 &&
    Array.isArray(raw.sections) &&
    Array.isArray(raw.fields)
  );
}

function coerceOldFieldToNew(
  raw: unknown,
  index: number,
  takenKeys: Set<string>,
): FormField | null {
  if (!isObject(raw)) return null;
  const rawType = typeof raw.type === 'string' ? (raw.type as string) : 'text';
  const mappedType: FieldType =
    rawType in OLD_TYPE_TO_NEW
      ? OLD_TYPE_TO_NEW[rawType as OldFieldType]
      : 'short_text';

  const label =
    typeof raw.label === 'string' && raw.label.trim().length > 0
      ? raw.label
      : `Question ${index + 1}`;

  const oldKey = typeof raw.key === 'string' ? raw.key : '';
  let internalKey =
    oldKey && INTERNAL_KEY_RE.test(oldKey)
      ? oldKey
      : snakeCaseFromLabel(label || `field_${index + 1}`);
  // Dedupe within the converted form.
  if (takenKeys.has(internalKey)) {
    let n = 2;
    while (takenKeys.has(`${internalKey}_${n}`)) n += 1;
    internalKey = `${internalKey}_${n}`;
  }
  takenKeys.add(internalKey);

  const helperText =
    typeof raw.helperText === 'string' ? raw.helperText : undefined;
  const placeholder =
    typeof raw.placeholder === 'string' ? raw.placeholder : undefined;

  const field: FormField = {
    id: generateId(),
    type: mappedType,
    sectionId: null,
    label,
    helperText,
    placeholder,
    required: raw.required === true,
    internalKey,
    order: index,
  };

  // Options: array of strings (legacy) -> array of {value,label}.
  if (
    Array.isArray(raw.options) &&
    (mappedType === 'dropdown' ||
      mappedType === 'radio' ||
      mappedType === 'multi_select')
  ) {
    const opts: FieldOption[] = [];
    for (const o of raw.options) {
      if (typeof o === 'string') {
        opts.push({ value: snakeCaseFromLabel(o) || o, label: o });
      } else if (isObject(o) && typeof o.label === 'string') {
        const v = typeof o.value === 'string' ? o.value : o.label;
        opts.push({ value: v, label: o.label });
      }
    }
    if (opts.length > 0) field.options = opts;
  }

  return field;
}

/** Pure converter: legacy array OR new object OR garbage → new object. */
export function normalizeSchema(raw: unknown): FormBuilderSchema {
  if (isNewShape(raw)) {
    // Re-normalize order numbers in case they drifted.
    return {
      schemaVersion: 2,
      sections: raw.sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i })),
      fields: raw.fields.slice().map((f, i) => ({ ...f, order: f.order ?? i })),
    };
  }

  // Old shape: an array of field-like objects.
  if (Array.isArray(raw)) {
    const taken = new Set<string>();
    const fields: FormField[] = [];
    raw.forEach((entry, i) => {
      const f = coerceOldFieldToNew(entry, i, taken);
      if (f) fields.push(f);
    });
    return { schemaVersion: 2, sections: [], fields };
  }

  // Unknown / missing — return an empty shape.
  return { schemaVersion: 2, sections: [], fields: [] };
}

// ---------- Convenience selectors ----------

/** Fields in a given section, ordered by `order`. Pass `null` for top-level. */
export function fieldsInSection(
  schema: FormBuilderSchema,
  sectionId: string | null,
): FormField[] {
  return schema.fields
    .filter((f) => f.sectionId === sectionId)
    .sort((a, b) => a.order - b.order);
}

/** True when the form has at least one section. */
export function hasSections(schema: FormBuilderSchema): boolean {
  return schema.sections.length > 0;
}

/** Section list, ordered. */
export function orderedSections(schema: FormBuilderSchema): FormSection[] {
  return schema.sections.slice().sort((a, b) => a.order - b.order);
}
