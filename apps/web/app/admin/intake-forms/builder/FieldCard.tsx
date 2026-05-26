'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Badge } from '@/components/ui';
import { TrashIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import { FIELD_TYPE_LABELS, type FormField } from '../_schema-utils';

import { DragHandleIcon, FIELD_TYPE_ICONS } from './_icons';

type Props = {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  disabled?: boolean;
  /** When true, the inner Sortable wiring is skipped (drag preview, etc). */
  asOverlay?: boolean;
};

// One field row in the canvas. Click anywhere (except the explicit drag
// handle / delete button) to open the settings drawer.
export function FieldCard({
  field,
  selected,
  onSelect,
  onDelete,
  disabled,
  asOverlay,
}: Props) {
  const sortable = useSortable({
    id: field.id,
    data: { kind: 'field', sectionId: field.sectionId },
    disabled: disabled || asOverlay,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const Icon = FIELD_TYPE_ICONS[field.type];

  return (
    <div
      ref={asOverlay ? undefined : setNodeRef}
      style={asOverlay ? undefined : style}
      className={cn(
        'group flex items-start gap-s3 rounded-md border bg-white px-s3 py-s3 shadow-sm',
        'transition-colors duration-fast',
        selected
          ? 'border-accent ring-[1.5px] ring-accent/30'
          : 'border-surface-3 hover:border-sage',
      )}
    >
      <button
        type="button"
        aria-label="Drag field"
        className={cn(
          'mt-[2px] flex shrink-0 cursor-grab items-center text-ink-soft/70',
          'hover:text-ink active:cursor-grabbing',
          'focus-visible:outline-none focus-visible:shadow-focus',
        )}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon size={18} />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-start gap-s3 text-left"
      >
        <span className="mt-[2px] shrink-0 text-ink-soft">
          <Icon size={18} />
        </span>
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span className="flex items-center gap-s2">
            <span className="truncate t-body-md font-medium text-ink">
              {field.label || 'Untitled field'}
            </span>
            {field.required ? (
              <Badge tone="amber">Required</Badge>
            ) : null}
          </span>
          <span className="t-caption text-ink-soft">
            {FIELD_TYPE_LABELS[field.type]}
            {field.internalKey ? (
              <>
                {' · '}
                <code className="font-mono text-[12px]">
                  {field.internalKey}
                </code>
              </>
            ) : null}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete field"
        className={cn(
          'shrink-0 rounded-md p-s2 text-ink-soft',
          'opacity-0 transition-opacity duration-fast group-hover:opacity-100',
          'hover:bg-red-pale hover:text-red',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus',
        )}
      >
        <TrashIcon size={16} />
      </button>
    </div>
  );
}
