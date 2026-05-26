'use client';

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useMemo, useState, useTransition } from 'react';

import { Alert, Button, Card, FormField, Input } from '@/components/ui';
import { PlusIcon } from '@/app/admin/_shell/icons';
import type { IntakeFormDefinitionDto } from '@/lib/api/intake-forms';
import { cn } from '@/lib/cn';

import {
  publishIntakeFormDefinitionAction,
  saveIntakeFormDefinitionAction,
} from '../actions';
import {
  createEmptyField,
  createEmptySection,
  fieldsInSection,
  generateUniqueInternalKey,
  normalizeSchema,
  orderedSections,
  snakeCaseFromLabel,
  validateInternalKey,
  type FieldType,
  type FormBuilderSchema,
  type FormField as FormFieldT,
  type FormSection,
} from '../_schema-utils';

import { FieldCard } from './FieldCard';
import { FieldSettingsDrawer } from './FieldSettingsDrawer';
import { FieldTypePalette } from './FieldTypePalette';
import { SectionCard } from './SectionCard';

type Props = {
  definition: IntakeFormDefinitionDto;
};

// Top-level visual builder. Owns the working schema in local React state and
// commits via `saveIntakeFormDefinitionAction` (publish is a separate
// transition). Sections + fields are drag-reorderable via @dnd-kit; the
// outer DndContext below routes cross-section field moves.
export function FormBuilder({ definition }: Props) {
  const initial = useMemo<FormBuilderSchema>(
    () => normalizeSchema(definition.schema),
    [definition.schema],
  );

  const [title, setTitle] = useState(definition.title);
  const [schema, setSchema] = useState<FormBuilderSchema>(initial);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [saveMessage, setSaveMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [saving, startSave] = useTransition();
  const [publishing, startPub] = useTransition();
  const [pubMessage, setPubMessage] = useState<string | null>(null);

  const readOnly = definition.status !== 'draft';

  const selectedField = useMemo(
    () => schema.fields.find((f) => f.id === selectedFieldId) ?? null,
    [schema.fields, selectedFieldId],
  );

  // ---------- Validation gate ----------

  const validation = useMemo(() => {
    const errors: string[] = [];
    const keys = new Set<string>();
    for (const f of schema.fields) {
      const v = validateInternalKey(f.internalKey);
      if (!v.ok) {
        errors.push(`Field "${f.label || 'Untitled'}": ${v.error}`);
        continue;
      }
      if (keys.has(f.internalKey)) {
        errors.push(
          `Field "${f.label || 'Untitled'}": internal key "${f.internalKey}" is used more than once.`,
        );
      }
      keys.add(f.internalKey);
    }
    return { ok: errors.length === 0, errors };
  }, [schema.fields]);

  // ---------- Field + section operations ----------

  const addField = useCallback(
    (type: FieldType) => {
      setSchema((prev) => {
        // Land the new field in the last section if any, else top-level.
        let sectionId: string | null = null;
        if (prev.sections.length > 0) {
          const last = prev.sections[prev.sections.length - 1];
          if (last) sectionId = last.id;
        }
        const stub = createEmptyField(type, sectionId);
        const base = snakeCaseFromLabel(stub.label);
        stub.internalKey = generateUniqueInternalKey(prev, base);
        // Append to end of target section/top-level.
        const siblings = prev.fields.filter((f) => f.sectionId === sectionId);
        stub.order = siblings.length;
        const next: FormBuilderSchema = {
          ...prev,
          fields: [...prev.fields, stub],
        };
        // Auto-select the new field so the drawer opens.
        queueMicrotask(() => setSelectedFieldId(stub.id));
        return next;
      });
    },
    [],
  );

  const updateField = useCallback(
    (id: string, patch: Partial<FormFieldT>) => {
      setSchema((prev) => {
        const fields = prev.fields.map((f) => {
          if (f.id !== id) return f;
          const merged = { ...f, ...patch };
          // Label→key auto-derivation: when the user edits the label, sync
          // the internal key as long as it still matches the previous
          // label-derived key (i.e. the user hasn't customized it).
          if (
            patch.label !== undefined &&
            patch.internalKey === undefined &&
            f.internalKey === snakeCaseFromLabel(f.label)
          ) {
            const base = snakeCaseFromLabel(merged.label);
            merged.internalKey = generateUniqueInternalKey(prev, base, f.id);
          }
          return merged;
        });
        return { ...prev, fields };
      });
    },
    [],
  );

  const deleteField = useCallback((id: string) => {
    setSchema((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
    setSelectedFieldId((cur) => (cur === id ? null : cur));
  }, []);

  const addSection = useCallback(() => {
    setSchema((prev) => {
      const section = createEmptySection();
      section.order = prev.sections.length;
      return { ...prev, sections: [...prev.sections, section] };
    });
  }, []);

  const updateSection = useCallback(
    (id: string, patch: Partial<Omit<FormSection, 'id' | 'order'>>) => {
      setSchema((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
    },
    [],
  );

  const deleteSection = useCallback((id: string) => {
    setSchema((prev) => {
      // Move any fields that lived in this section to top-level so we don't
      // orphan them. Their order resets after the existing top-level tail.
      const topLevelCount = prev.fields.filter((f) => f.sectionId === null).length;
      const inSection = prev.fields
        .filter((f) => f.sectionId === id)
        .sort((a, b) => a.order - b.order);
      const movedFields = inSection.map((f, i) => ({
        ...f,
        sectionId: null,
        order: topLevelCount + i,
      }));
      const fields = prev.fields.map((f) => {
        if (f.sectionId !== id) return f;
        const moved = movedFields.find((m) => m.id === f.id);
        return moved ?? f;
      });
      return {
        ...prev,
        sections: prev.sections
          .filter((s) => s.id !== id)
          .map((s, i) => ({ ...s, order: i })),
        fields,
      };
    });
  }, []);

  const reorderFieldsInSection = useCallback(
    (sectionId: string | null, orderedIds: string[]) => {
      setSchema((prev) => {
        // Reapply `order` for the section we just reordered. Fields outside
        // it keep their existing order.
        const updated = prev.fields.map((f) => {
          if (f.sectionId !== sectionId) return f;
          const idx = orderedIds.indexOf(f.id);
          if (idx < 0) return f;
          return { ...f, order: idx };
        });
        return { ...prev, fields: updated };
      });
    },
    [],
  );

  const reorderSections = useCallback((orderedIds: string[]) => {
    setSchema((prev) => {
      const byId = new Map(prev.sections.map((s) => [s.id, s]));
      const next: FormSection[] = [];
      orderedIds.forEach((id, i) => {
        const s = byId.get(id);
        if (s) next.push({ ...s, order: i });
      });
      // Append any sections we somehow missed (defensive).
      for (const s of prev.sections) {
        if (!orderedIds.includes(s.id)) next.push({ ...s, order: next.length });
      }
      return { ...prev, sections: next };
    });
  }, []);

  // ---------- Outer DnD: sections + cross-section field moves ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedSections = orderedSections(schema);
  const topLevelFields = fieldsInSection(schema, null);

  function handleOuterDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeData = active.data.current as
      | { kind?: 'section' | 'field'; sectionId?: string | null }
      | undefined;
    const overData = over.data.current as
      | { kind?: 'section' | 'field'; sectionId?: string | null }
      | undefined;

    // Section reorder
    if (activeData?.kind === 'section') {
      const ids = sortedSections.map((s) => s.id);
      const oldIdx = ids.indexOf(String(active.id));
      const newIdx = ids.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return;
      const next = ids.slice();
      const [moved] = next.splice(oldIdx, 1);
      if (moved !== undefined) {
        next.splice(newIdx, 0, moved);
        reorderSections(next);
      }
      return;
    }

    // Cross-section field move: when a field is dragged over a different
    // section's field, change its sectionId and reorder accordingly.
    if (activeData?.kind === 'field' && overData?.kind === 'field') {
      const fromSection = activeData.sectionId ?? null;
      const toSection = overData.sectionId ?? null;
      if (fromSection !== toSection) {
        setSchema((prev) => {
          const targetSiblings = prev.fields
            .filter((f) => f.sectionId === toSection)
            .sort((a, b) => a.order - b.order);
          const overIdx = targetSiblings.findIndex((f) => f.id === over.id);
          const insertAt = overIdx < 0 ? targetSiblings.length : overIdx;
          const updated = prev.fields.map((f) => {
            if (f.id === active.id) {
              return { ...f, sectionId: toSection, order: insertAt };
            }
            if (f.sectionId === toSection) {
              // Shift target siblings at or after insertAt up by one.
              if (f.order >= insertAt) return { ...f, order: f.order + 1 };
            }
            return f;
          });
          return { ...prev, fields: updated };
        });
      }
    }
  }

  // ---------- Save / publish ----------

  function onSave() {
    if (!validation.ok) {
      setSaveMessage({
        tone: 'error',
        text: 'Fix the validation errors below before saving.',
      });
      return;
    }
    setSaveMessage(null);
    const fd = new FormData();
    fd.set('id', definition.id);
    fd.set('title', title);
    fd.set('schemaJson', JSON.stringify(schema));
    startSave(async () => {
      const r = await saveIntakeFormDefinitionAction({ ok: false }, fd);
      if (r.ok) {
        setSaveMessage({ tone: 'success', text: 'Saved.' });
      } else {
        setSaveMessage({ tone: 'error', text: r.error ?? 'Save failed.' });
      }
    });
  }

  function onPublish() {
    setPubMessage(null);
    startPub(async () => {
      const r = await publishIntakeFormDefinitionAction(definition.id);
      if (r.ok) {
        setPubMessage('Published. This version is now live.');
      } else {
        setPubMessage(r.error ?? 'Publish failed.');
      }
    });
  }

  // ---------- Render ----------

  return (
    <div className="flex flex-col gap-s6">
      <Card
        padding="lg"
        className="rounded-2xl border border-surface-3 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-s4">
          <div className="flex min-w-0 flex-1 flex-col gap-s2">
            <span className="t-eyebrow text-accent">Intake form</span>
            <FormField label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={readOnly}
              />
            </FormField>
            <p className="t-body-sm text-ink-soft">
              Status:{' '}
              <span className="capitalize font-medium text-ink">
                {definition.status}
              </span>
              {' · '}v{definition.version}
              {' · '}group{' '}
              <code className="rounded bg-surface-2 px-s1 font-mono text-[12px]">
                {definition.groupId}
              </code>
            </p>
          </div>
          <div className="flex flex-col items-end gap-s2">
            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-s3">
                <Button
                  type="button"
                  variant="accent"
                  loading={saving}
                  disabled={saving || publishing}
                  onClick={onSave}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={publishing}
                  disabled={saving || publishing}
                  onClick={onPublish}
                >
                  Publish
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {readOnly ? (
          <p className="mt-s4 rounded-lg bg-surface-2/80 px-s4 py-s3 t-body-sm text-ink-soft">
            Published or archived versions are read-only.
          </p>
        ) : null}

        {saveMessage ? (
          <Alert
            tone={saveMessage.tone === 'success' ? 'success' : 'error'}
            className="mt-s4"
          >
            {saveMessage.text}
          </Alert>
        ) : null}
        {pubMessage ? (
          <Alert
            tone={
              pubMessage.includes('failed') || pubMessage.includes('Could not')
                ? 'error'
                : 'success'
            }
            className="mt-s4"
          >
            {pubMessage}
          </Alert>
        ) : null}

        {!validation.ok ? (
          <Alert tone="warning" className="mt-s4">
            <ul className="list-inside list-disc">
              {validation.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-s5 lg:grid-cols-[260px_1fr]">
        <div className="lg:sticky lg:top-s4 lg:self-start">
          <FieldTypePalette onAdd={addField} disabled={readOnly} />
        </div>

        <div className="flex flex-col gap-s4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleOuterDragEnd}
          >
            {/* Top-level fields (only when no sections exist yet OR when the
                user explicitly leaves a field outside a section). */}
            {topLevelFields.length > 0 ? (
              <Card
                padding="md"
                className="rounded-lg border border-surface-3 bg-white shadow-sm"
              >
                <SortableContext
                  items={topLevelFields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col gap-s2">
                    {topLevelFields.map((f) => (
                      <li key={f.id}>
                        <FieldCard
                          field={f}
                          selected={selectedFieldId === f.id}
                          onSelect={() => setSelectedFieldId(f.id)}
                          onDelete={() => deleteField(f.id)}
                          disabled={readOnly}
                        />
                      </li>
                    ))}
                  </ul>
                </SortableContext>
              </Card>
            ) : null}

            {/* Sections */}
            <SortableContext
              items={sortedSections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-s4">
                {sortedSections.map((s) => (
                  <SectionCard
                    key={s.id}
                    section={s}
                    fields={fieldsInSection(schema, s.id)}
                    selectedFieldId={selectedFieldId}
                    onUpdateSection={(patch) => updateSection(s.id, patch)}
                    onDeleteSection={() => deleteSection(s.id)}
                    onSelectField={(id) => setSelectedFieldId(id)}
                    onDeleteField={(id) => deleteField(id)}
                    onReorderFields={(ids) => reorderFieldsInSection(s.id, ids)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Empty state when the form is empty */}
          {topLevelFields.length === 0 && sortedSections.length === 0 ? (
            <Card
              padding="lg"
              className={cn(
                'rounded-lg border border-dashed border-surface-3 bg-surface-2/30 text-center',
              )}
            >
              <p className="t-body-md text-ink-soft">
                Empty form. Add your first field from the palette on the left.
              </p>
            </Card>
          ) : null}

          {!readOnly ? (
            <div className="flex">
              <Button
                type="button"
                variant="ghost"
                onClick={addSection}
                icon={<PlusIcon size={16} />}
              >
                Add section
              </Button>
            </div>
          ) : null}

          <Card
            padding="md"
            className="border border-dashed border-surface-3 bg-surface-2/40"
          >
            <p className="t-caption text-ink-soft">
              Each field has a snake_case <code className="font-mono">internalKey</code>{' '}
              used by reports + the API. Conditional logic and mobile preview
              land in a follow-up.
            </p>
          </Card>
        </div>
      </div>

      <FieldSettingsDrawer
        open={selectedField !== null}
        field={selectedField}
        schema={schema}
        onClose={() => setSelectedFieldId(null)}
        onChange={(patch) => {
          if (selectedField) updateField(selectedField.id, patch);
        }}
        onDelete={() => {
          if (selectedField) deleteField(selectedField.id);
        }}
      />
    </div>
  );
}
