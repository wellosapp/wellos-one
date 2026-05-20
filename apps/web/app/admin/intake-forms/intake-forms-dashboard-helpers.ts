import type { IntakeFormDefinitionDto } from '@/lib/api/intake-forms';

export type IntakeFormStatusFilter = '' | 'draft' | 'published' | 'archived';

export function formatIntakeFormDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function intakeStatusTone(
  status: IntakeFormDefinitionDto['status'],
): 'neutral' | 'accent' | 'green' | 'amber' | 'red' {
  switch (status) {
    case 'draft':
      return 'amber';
    case 'published':
      return 'green';
    case 'archived':
      return 'neutral';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function intakeStatusLabel(status: IntakeFormDefinitionDto['status']): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Short line under title: field count + sample labels (no DB description field yet). */
export function intakeFormDescriptionLine(schema: unknown): string {
  if (!Array.isArray(schema)) {
    return 'No fields defined yet.';
  }
  const n = schema.length;
  if (n === 0) {
    return 'No fields yet — add questions in the editor.';
  }
  const labels = schema
    .slice(0, 2)
    .map((f) => (f && typeof f === 'object' && 'label' in f ? String((f as { label: unknown }).label) : ''))
    .filter(Boolean);
  const preview = labels.join(' · ');
  if (n <= 2) {
    return `${n} field${n === 1 ? '' : 's'}${preview ? ` · ${preview}` : ''}`;
  }
  return `${n} fields · ${preview}…`;
}

export function countIntakeFormsByStatus(definitions: IntakeFormDefinitionDto[]): {
  total: number;
  draft: number;
  published: number;
  archived: number;
} {
  let draft = 0;
  let published = 0;
  let archived = 0;
  for (const d of definitions) {
    if (d.status === 'draft') draft += 1;
    else if (d.status === 'published') published += 1;
    else archived += 1;
  }
  return { total: definitions.length, draft, published, archived };
}

export function filterIntakeFormDefinitions(
  definitions: IntakeFormDefinitionDto[],
  filters: {
    status?: IntakeFormStatusFilter;
    q?: string;
    groupId?: string;
  },
): IntakeFormDefinitionDto[] {
  const qNorm = filters.q?.trim().toLowerCase() ?? '';
  const status = filters.status || undefined;
  const groupId = filters.groupId?.trim() || undefined;

  return definitions.filter((d) => {
    if (status && d.status !== status) return false;
    if (groupId && d.groupId !== groupId) return false;
    if (qNorm && !d.title.toLowerCase().includes(qNorm)) return false;
    return true;
  });
}
