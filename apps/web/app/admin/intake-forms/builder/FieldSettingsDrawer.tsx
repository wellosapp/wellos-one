'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button, Drawer, FormField, Input, Select, Textarea } from '@/components/ui';
import { TrashIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import {
  FIELD_TYPE_LABELS,
  type FieldOption,
  type FieldValidation,
  type FormBuilderSchema,
  type FormField as FormFieldT,
  validateInternalKey,
} from '../_schema-utils';

type Props = {
  open: boolean;
  field: FormFieldT | null;
  schema: FormBuilderSchema;
  onClose: () => void;
  onChange: (patch: Partial<FormFieldT>) => void;
  onDelete: () => void;
};

const SHOWS_PLACEHOLDER: Record<string, boolean> = {
  short_text: true,
  long_text: true,
  number: true,
  phone: true,
  email: true,
};

const HAS_OPTIONS: Record<string, boolean> = {
  dropdown: true,
  radio: true,
  multi_select: true,
};

const HAS_NUMBER_RANGE: Record<string, boolean> = {
  number: true,
  rating: true,
  pain_scale: true,
};

const HAS_TEXT_LENGTH: Record<string, boolean> = {
  short_text: true,
  long_text: true,
};

const HAS_FILE_LIMITS: Record<string, boolean> = {
  file_upload: true,
  image_upload: true,
};

// Right-side panel that edits a single field's config. The parent holds the
// canonical schema; this drawer pipes patches via `onChange`. internalKey
// uniqueness is validated against the full schema (minus the current field
// id) so the Save button on the form is the one that gates submit.
export function FieldSettingsDrawer({
  open,
  field,
  schema,
  onClose,
  onChange,
  onDelete,
}: Props) {
  // Internal key has its own local-debounced state so the user can type
  // freely without the parent reordering / collisions surfacing per keystroke.
  const [keyDraft, setKeyDraft] = useState(field?.internalKey ?? '');

  useEffect(() => {
    setKeyDraft(field?.internalKey ?? '');
  }, [field?.id, field?.internalKey]);

  const keyValidation = useMemo(() => {
    if (!field) return { ok: true as const };
    const v = validateInternalKey(keyDraft);
    if (!v.ok) return v;
    const dup = schema.fields.some(
      (f) => f.id !== field.id && f.internalKey === keyDraft,
    );
    if (dup) {
      return { ok: false as const, error: 'Another field already uses this key.' };
    }
    return { ok: true as const };
  }, [keyDraft, schema.fields, field]);

  function commitKey() {
    if (!field) return;
    if (keyValidation.ok && keyDraft !== field.internalKey) {
      onChange({ internalKey: keyDraft });
    }
  }

  function setValidation(patch: Partial<FieldValidation>) {
    if (!field) return;
    const next: FieldValidation = { ...(field.validation ?? {}), ...patch };
    // Strip undefined keys so the saved object stays tidy.
    const cleaned: FieldValidation = {};
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) {
        (cleaned as Record<string, unknown>)[k] = v;
      }
    }
    onChange({ validation: Object.keys(cleaned).length > 0 ? cleaned : undefined });
  }

  function setOption(idx: number, patch: Partial<FieldOption>) {
    if (!field) return;
    const next = (field.options ?? []).slice();
    const existing = next[idx];
    if (!existing) return;
    next[idx] = { ...existing, ...patch };
    onChange({ options: next });
  }

  function addOption() {
    if (!field) return;
    const next = (field.options ?? []).slice();
    const n = next.length + 1;
    next.push({ value: `option_${n}`, label: `Option ${n}` });
    onChange({ options: next });
  }

  function removeOption(idx: number) {
    if (!field) return;
    const next = (field.options ?? []).slice();
    next.splice(idx, 1);
    onChange({ options: next });
  }

  if (!field) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title="Field settings"
        ariaLabel="Field settings"
      >
        <div className="px-s6 py-s6 t-body-sm text-ink-soft">
          Select a field to edit its settings.
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={field.label || 'Untitled field'}
      subtitle={FIELD_TYPE_LABELS[field.type]}
      ariaLabel="Field settings"
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onDelete}
            className={cn(
              'inline-flex items-center gap-s2 rounded-md px-s3 py-s2 t-body-sm text-red',
              'hover:bg-red-pale',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            <TrashIcon size={16} />
            Delete field
          </button>
          <Button type="button" variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-s4 px-s6 py-s5">
        <FormField label="Label">
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </FormField>

        <FormField label="Helper text" hint="Short hint shown under the field.">
          <Input
            value={field.helperText ?? ''}
            onChange={(e) => onChange({ helperText: e.target.value })}
          />
        </FormField>

        {SHOWS_PLACEHOLDER[field.type] ? (
          <FormField label="Placeholder">
            <Input
              value={field.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value })}
            />
          </FormField>
        ) : null}

        <FormField
          label="Internal key"
          error={keyValidation.ok ? undefined : keyValidation.error}
          hint="snake_case identifier used by reports + API."
        >
          <Input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={commitKey}
            error={!keyValidation.ok}
            spellCheck={false}
          />
        </FormField>

        <label className="flex cursor-pointer items-center gap-s2 t-body-md text-ink">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-4 w-4 accent-sage-deep"
          />
          <span>Required</span>
        </label>

        {/* Type-specific settings */}
        {HAS_TEXT_LENGTH[field.type] ? (
          <div className="grid grid-cols-2 gap-s3">
            <FormField label="Min length">
              <Input
                type="number"
                value={field.validation?.minLength ?? ''}
                onChange={(e) =>
                  setValidation({
                    minLength:
                      e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Max length">
              <Input
                type="number"
                value={field.validation?.maxLength ?? ''}
                onChange={(e) =>
                  setValidation({
                    maxLength:
                      e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField
              label="Pattern (regex)"
              hint="Optional. Source only, no /flags/."
              className="col-span-2"
            >
              <Input
                value={field.validation?.pattern ?? ''}
                onChange={(e) =>
                  setValidation({ pattern: e.target.value || undefined })
                }
                spellCheck={false}
              />
            </FormField>
          </div>
        ) : null}

        {HAS_NUMBER_RANGE[field.type] ? (
          <div className="grid grid-cols-3 gap-s3">
            <FormField label="Min">
              <Input
                type="number"
                value={field.validation?.min ?? ''}
                onChange={(e) =>
                  setValidation({
                    min: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Max">
              <Input
                type="number"
                value={field.validation?.max ?? ''}
                onChange={(e) =>
                  setValidation({
                    max: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Step">
              <Input
                type="number"
                value={field.validation?.step ?? ''}
                onChange={(e) =>
                  setValidation({
                    step: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
          </div>
        ) : null}

        {HAS_FILE_LIMITS[field.type] ? (
          <div className="grid grid-cols-1 gap-s3">
            <FormField label="Max file size (MB)">
              <Input
                type="number"
                value={field.validation?.maxFileSizeMb ?? ''}
                onChange={(e) =>
                  setValidation({
                    maxFileSizeMb:
                      e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField
              label="Accepted MIME types"
              hint="Comma-separated. e.g. image/png, image/jpeg, application/pdf"
            >
              <Textarea
                rows={2}
                value={(field.validation?.acceptedMimeTypes ?? []).join(', ')}
                onChange={(e) => {
                  const list = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setValidation({
                    acceptedMimeTypes: list.length > 0 ? list : undefined,
                  });
                }}
                spellCheck={false}
              />
            </FormField>
          </div>
        ) : null}

        {HAS_OPTIONS[field.type] ? (
          <fieldset className="flex flex-col gap-s2">
            <legend className="t-label text-ink">Options</legend>
            {(field.options ?? []).length === 0 ? (
              <p className="t-caption text-ink-soft">
                No options yet. Add at least one.
              </p>
            ) : null}
            {(field.options ?? []).map((opt, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-s2">
                <Input
                  placeholder="Label"
                  value={opt.label}
                  onChange={(e) => setOption(idx, { label: e.target.value })}
                />
                <Input
                  placeholder="Value"
                  value={opt.value}
                  onChange={(e) => setOption(idx, { value: e.target.value })}
                  spellCheck={false}
                />
                <button
                  type="button"
                  aria-label="Remove option"
                  onClick={() => removeOption(idx)}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-s3 text-ink-soft',
                    'hover:bg-red-pale hover:text-red',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                  )}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addOption}
              className="self-start"
            >
              + Add option
            </Button>
          </fieldset>
        ) : null}

        {/* Section move shortcut */}
        {schema.sections.length > 0 ? (
          <FormField label="Section">
            <Select
              value={field.sectionId ?? ''}
              onChange={(e) =>
                onChange({ sectionId: e.target.value === '' ? null : e.target.value })
              }
            >
              <option value="">No section (top-level)</option>
              {schema.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || 'Untitled section'}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}
