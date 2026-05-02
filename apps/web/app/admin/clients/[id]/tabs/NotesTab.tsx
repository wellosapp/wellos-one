'use client';

// useFormState (react-dom) is React-18's equivalent of useActionState.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';

import { LinkedNotesList } from '@/components/admin/LinkedNotesList';
import {
  Alert,
  Button,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import type { ClientNoteSummary } from '@/lib/api/client-notes';

import {
  addClientNoteAction,
  type ActionState,
} from '../_actions';

interface NotesTabProps {
  clientId: string;
  notes: ClientNoteSummary[];
}

const INITIAL: ActionState = { ok: false };

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'preference', label: 'Preference' },
  { value: 'formula', label: 'Formula' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'medical', label: 'Medical' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'billing', label: 'Billing' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'internal', label: 'Internal' },
  { value: 'session', label: 'Session note' },
  { value: 'customer_request', label: 'Customer request' },
];

const VISIBILITIES = [
  { value: 'location', label: 'Visible to all staff at this location' },
  { value: 'provider_only', label: 'Provider only' },
  { value: 'admin_only', label: 'Admin only' },
  { value: 'protected_clinical', label: 'Protected clinical' },
];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="md"
      disabled={pending}
      loading={pending}
    >
      Save note
    </Button>
  );
}

export function NotesTab({ clientId, notes }: NotesTabProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addClientNoteAction.bind(null, clientId);
  const [state, formAction] = useFormState<ActionState, FormData>(
    action,
    INITIAL,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  // Surface alerts at the top, then visit-linked, then standalone.
  // Pinned alert-priority notes pop to the top of their group.
  const sorted = [...notes].sort((a, b) => {
    if (a.priority === 'alert' && b.priority !== 'alert') return -1;
    if (b.priority === 'alert' && a.priority !== 'alert') return 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col gap-s5">
      <section className="flex flex-col gap-s3">
        <header className="flex items-center justify-between gap-s3">
          <h2 className="t-display-sm text-ink">All notes ({notes.length})</h2>
        </header>
        <LinkedNotesList
          notes={sorted}
          emptyLabel="No notes for this client yet."
        />
      </section>

      <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s5">
        <h2 className="t-display-sm text-ink">Add a note</h2>

        {state.error && !state.ok && <Alert tone="error">{state.error}</Alert>}
        {state.ok && (
          <Alert tone="success">Note saved — refreshing the list.</Alert>
        )}

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col gap-s3"
        >
          <div className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
            <FormField label="Category" error={state.fieldErrors?.category}>
              <Select name="category" defaultValue="general">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Visibility"
              error={state.fieldErrors?.visibility}
            >
              <Select name="visibility" defaultValue="location">
                {VISIBILITIES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Title (optional)" error={state.fieldErrors?.title}>
            <Input
              type="text"
              name="title"
              maxLength={200}
              placeholder="Optional title — useful for pinned alerts"
            />
          </FormField>

          <FormField label="Body" error={state.fieldErrors?.body} required>
            <Textarea
              name="body"
              rows={4}
              required
              maxLength={8000}
              placeholder="What should every staff member know about this client?"
            />
          </FormField>

          <input type="hidden" name="priority" value="normal" />

          <div className="flex justify-end">
            <SaveButton />
          </div>
        </form>
      </section>
    </div>
  );
}
