'use client';

import {
  ClientQuickBookDrawer,
  type ClientQuickBookSummary,
} from '../ClientQuickBookDrawer';
import type { ClientQuickBookDirectory } from '../ClientDetailShell';

export function BookTabClient({
  summary,
  directory,
  directoryError,
}: {
  summary: ClientQuickBookSummary;
  directory: ClientQuickBookDirectory;
  directoryError: string | null;
}) {
  return (
    <ClientQuickBookDrawer
      mode="inline"
      open
      onClose={() => {}}
      client={summary}
      services={directory.services}
      staff={directory.staff}
      locations={directory.locations}
      directoryError={directoryError}
    />
  );
}
