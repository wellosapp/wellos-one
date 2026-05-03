'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input } from '@/components/ui';

import type { CategoryInlineState } from './_actions';
import { createCategoryInlineAction } from './_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="md" loading={pending}>
      {pending ? 'Adding…' : 'Add category'}
    </Button>
  );
}

export function CategoryInlineForm() {
  const [state, formAction] = useFormState<CategoryInlineState, FormData>(
    createCategoryInlineAction,
    { ok: false },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-s3">
      {state.ok && (
        <Alert tone="success" className="w-full">
          Category added.
        </Alert>
      )}
      {state.error && (
        <Alert tone="error" className="w-full">
          {state.error}
        </Alert>
      )}
      <FormField label="New category name" className="min-w-[200px] flex-1">
        <Input type="text" name="name" required maxLength={120} placeholder="e.g. Massage" />
      </FormField>
      <FormField label="Display order" hint="Optional; lower sorts first." className="w-[140px]">
        <Input type="number" name="displayOrder" inputMode="numeric" min={0} step={1} />
      </FormField>
      <SubmitButton />
    </form>
  );
}
