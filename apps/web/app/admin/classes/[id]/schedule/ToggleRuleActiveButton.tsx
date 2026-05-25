'use client';

import { useTransition } from 'react';

import { Button } from '@/components/ui';

import { toggleRuleActiveAction } from './_actions';

// Pause / Resume toggle. Calls toggleRuleActiveAction with the flipped value;
// the server action handles 404 silently for races (row deleted between
// list render and click).

type Props = {
  classId: string;
  ruleId: string;
  active: boolean;
};

export function ToggleRuleActiveButton({ classId, ruleId, active }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleRuleActiveAction(classId, ruleId, !active);
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      loading={isPending}
      onClick={handleClick}
    >
      {active ? 'Pause' : 'Resume'}
    </Button>
  );
}
