'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';

import { CreateAutomationModal } from './CreateAutomationModal';

export function CreateAutomationButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="accent"
        size="md"
        onClick={() => setOpen(true)}
      >
        + New automation
      </Button>
      {open ? <CreateAutomationModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
