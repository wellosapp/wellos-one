'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui';
import type { ManualClassInstanceState } from '@/lib/api/class-bookings';

import { setInstanceStateAction } from './_actions';

// Admin-only lifecycle controls. Sits inside the ClassInstanceHeader server
// component but lives here so we can call useTransition + useRouter. Each
// button corresponds to one of the manual transitions allowed by
// services/classInstanceService.ts.

interface InstanceStateControlsProps {
  instanceId: string;
  state: string;
}

function buttonsForState(state: string): {
  label: string;
  target: ManualClassInstanceState;
}[] {
  if (state === 'scheduled') {
    return [
      { label: 'Mark in progress', target: 'in_progress' },
      { label: 'Mark completed', target: 'completed' },
    ];
  }
  if (state === 'in_progress') {
    return [
      { label: 'Mark completed', target: 'completed' },
      { label: 'Back to scheduled', target: 'scheduled' },
    ];
  }
  if (state === 'completed') {
    return [{ label: 'Reopen', target: 'in_progress' }];
  }
  return [];
}

export function InstanceStateControls({
  instanceId,
  state,
}: InstanceStateControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const buttons = buttonsForState(state);
  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-s2">
      {buttons.map((b) => (
        <Button
          key={b.target}
          variant="ghost"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setInstanceStateAction(instanceId, b.target);
              router.refresh();
            })
          }
        >
          {b.label}
        </Button>
      ))}
    </div>
  );
}
