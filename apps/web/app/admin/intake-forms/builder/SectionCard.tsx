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
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TrashIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import type { FormField, FormSection } from '../_schema-utils';

import { DragHandleIcon } from './_icons';
import { FieldCard } from './FieldCard';

type Props = {
  section: FormSection;
  fields: FormField[];
  selectedFieldId: string | null;
  onUpdateSection: (patch: Partial<Omit<FormSection, 'id' | 'order'>>) => void;
  onDeleteSection: () => void;
  onSelectField: (id: string) => void;
  onDeleteField: (id: string) => void;
  onReorderFields: (orderedIds: string[]) => void;
};

// Wraps a section header (editable title + description) and a nested
// DndContext over the fields belonging to that section. The OUTER DndContext
// (in FormBuilder) handles cross-section moves; this inner one keeps
// intra-section reorders responsive and self-contained.
export function SectionCard({
  section,
  fields,
  selectedFieldId,
  onUpdateSection,
  onDeleteSection,
  onSelectField,
  onDeleteField,
  onReorderFields,
}: Props) {
  const sortable = useSortable({
    id: section.id,
    data: { kind: 'section' },
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fieldIds = fields.map((f) => f.id);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = fieldIds.indexOf(String(active.id));
    const newIndex = fieldIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = fieldIds.slice();
    const [moved] = next.splice(oldIndex, 1);
    if (moved !== undefined) {
      next.splice(newIndex, 0, moved);
      onReorderFields(next);
    }
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-surface-3 bg-surface-2/40 shadow-sm"
    >
      <header className="flex items-start gap-s3 border-b border-surface-3 px-s4 py-s3">
        <button
          type="button"
          aria-label="Drag section"
          className={cn(
            'mt-[6px] shrink-0 cursor-grab text-ink-soft/70',
            'hover:text-ink active:cursor-grabbing',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon size={18} />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-s2">
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateSection({ title: e.target.value })}
            placeholder="Section title"
            aria-label="Section title"
            className={cn(
              'w-full rounded-md border border-transparent bg-transparent px-s2 py-[6px]',
              'font-display text-[18px] text-ink',
              'hover:border-surface-3 focus:border-accent focus:bg-white',
              'outline-none transition-[border-color,background-color] duration-fast',
            )}
          />
          <textarea
            rows={1}
            value={section.description ?? ''}
            onChange={(e) => onUpdateSection({ description: e.target.value })}
            placeholder="Optional section description"
            aria-label="Section description"
            className={cn(
              'w-full resize-y rounded-md border border-transparent bg-transparent px-s2 py-[6px]',
              't-body-sm text-ink-soft',
              'hover:border-surface-3 focus:border-accent focus:bg-white',
              'outline-none transition-[border-color,background-color] duration-fast',
            )}
          />
        </div>

        <button
          type="button"
          onClick={onDeleteSection}
          aria-label="Delete section"
          className={cn(
            'mt-[4px] shrink-0 rounded-md p-s2 text-ink-soft',
            'hover:bg-red-pale hover:text-red',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          <TrashIcon size={16} />
        </button>
      </header>

      <div className="px-s4 py-s3">
        {fields.length === 0 ? (
          <p className="rounded-md border border-dashed border-surface-3 bg-white/60 px-s4 py-s4 t-caption text-ink-soft">
            Drag a field here, or use the palette on the left to add one.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-s2">
                {fields.map((f) => (
                  <li key={f.id}>
                    <FieldCard
                      field={f}
                      selected={selectedFieldId === f.id}
                      onSelect={() => onSelectField(f.id)}
                      onDelete={() => onDeleteField(f.id)}
                    />
                  </li>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </section>
  );
}
