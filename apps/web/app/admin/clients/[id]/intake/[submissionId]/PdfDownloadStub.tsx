// Forms System PR 10 — placeholder "Download PDF" button.
//
// PDF export wiring lands in PR 12 (@react-pdf/renderer). This stub keeps
// the affordance visible so the UX doesn't appear to lose a feature in the
// middle of the rollout. Hover tooltip explains the wait.

import { Button } from '@/components/ui';

export function PdfDownloadStub() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled
      title="PDF export coming in PR 12"
    >
      Download PDF
    </Button>
  );
}
