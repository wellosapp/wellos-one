'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships React 18
// canary at runtime — see hotfix #28 for context.
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input } from '@/components/ui';

import type { ActionState, ClientTagFormValues } from './_actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ClientTagFormValues;
  submitLabel?: string;
  successMessage?: string;
};

export function ClientTagForm({
  action,
  initial,
  submitLabel = 'Save',
  successMessage = 'Saved.',
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  // After validation failure, re-display the values the user submitted.
  // After success, fall back to the action's echoed values so updated form
  // reflects what was just saved.
  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <FormField label="Name" required error={fieldErrors.name}>
        <Input
          type="text"
          name="name"
          required
          maxLength={80}
          defaultValue={values.name ?? ''}
          error={Boolean(fieldErrors.name)}
        />
      </FormField>

      <FormField
        label="Color"
        error={fieldErrors.color}
        hint="6-digit hex like #3D7A5E. Used on the tag pill."
      >
        <Input
          type="text"
          name="color"
          placeholder="#3D7A5E"
          maxLength={7}
          defaultValue={values.color ?? ''}
          error={Boolean(fieldErrors.color)}
        />
      </FormField>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
