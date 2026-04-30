'use client';

import { Button } from '@/components/ui';

// Per-row "Soft-delete" affordance for admin list tables. Wraps the
// existing soft-delete server action with a native confirm() so an
// accidental click doesn't silently send the row away. Form-based so
// the redirect + revalidatePath the action does still work.
//
// The action prop is a server action already bound to the row id, e.g.
// `deleteStaffAction.bind(null, row.id)`. Caller provides a confirmMessage
// that names the row so the dialog is unambiguous.

type Props = {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
};

export function DeleteConfirmButton({
  action,
  confirmMessage,
  label = 'Delete',
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="text-red hover:bg-red-pale"
      >
        {label}
      </Button>
    </form>
  );
}
