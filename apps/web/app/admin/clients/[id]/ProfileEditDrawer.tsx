'use client';

import { Drawer } from '@/components/ui';
import type {
  ClientTagSummary,
  ClientWriteBody,
} from '@/lib/api/clients';

import { ClientForm } from '../ClientForm';
import type { ActionState } from '../_actions';

// Wraps the existing ClientForm in a right-side drawer so editing happens
// from the profile page without a full route change. Keeps the Overview
// tab as the primary surface; Edit is a secondary action.

interface ProfileEditDrawerProps {
  clientId: string;
  initial: Partial<ClientWriteBody>;
  tags: ClientTagSummary[];
  updateAction: (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  onClose: () => void;
}

export function ProfileEditDrawer({
  initial,
  tags,
  updateAction,
  onClose,
}: ProfileEditDrawerProps) {
  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Edit client profile"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Edit</span>
          <h2 className="t-display-md text-ink">Client profile</h2>
        </div>
      }
      widthClassName="w-full max-w-[640px]"
    >
      <div className="px-s6 py-s5">
        <ClientForm
          action={updateAction}
          initial={initial}
          tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          submitLabel="Save changes"
          successMessage="Client updated."
        />
      </div>
    </Drawer>
  );
}
