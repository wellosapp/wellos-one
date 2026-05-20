'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input } from '@/components/ui';

import {
  startImpersonationByEmailAction,
  type ImpersonationStartActionState,
} from '../_impersonation-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Minting actor token…' : 'Sign in as this user'}
    </Button>
  );
}

export function ImpersonateForm() {
  const [state, formAction] = useFormState<
    ImpersonationStartActionState,
    FormData
  >(startImpersonationByEmailAction, { ok: false });

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-s4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <FormField label="Target user email" required>
        <Input
          type="email"
          name="targetEmail"
          required
          autoComplete="off"
          maxLength={254}
          placeholder="user@example.com"
        />
      </FormField>

      <p className="t-body-sm text-ink-soft">
        On submit, the browser is redirected to Clerk&rsquo;s hosted sign-in URL
        that swaps your session for the target&rsquo;s. Every action you take
        afterward records both your id (actor) and the target&rsquo;s id
        (subject) in the audit log. Exit via the banner that appears across
        the top of the admin shell.
      </p>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
