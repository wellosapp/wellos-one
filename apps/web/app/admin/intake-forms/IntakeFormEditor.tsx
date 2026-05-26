// Thin shim around the new visual builder. Kept in place so other admin
// surfaces (e.g. the [id]/page.tsx route) can import from a stable path
// while the implementation moved under ./builder/. See Forms PR 2.

import type { IntakeFormDefinitionDto } from '@/lib/api/intake-forms';

import { FormBuilder } from './builder/FormBuilder';

export function IntakeFormEditor({
  definition,
}: {
  definition: IntakeFormDefinitionDto;
}) {
  return <FormBuilder definition={definition} />;
}
