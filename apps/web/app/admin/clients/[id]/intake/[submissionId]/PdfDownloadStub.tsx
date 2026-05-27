// Forms System PR 12 — "Download PDF" affordance for a submission.
//
// File kept under the PR 10 name so the parent page's existing import path
// doesn't move. The behavior switched from disabled placeholder to a real
// link in PR 12.
//
// Eligibility mirrors the backend: PDFs only exist for status='submitted'
// rows. Other statuses keep the button visible-but-disabled with a tooltip
// rather than hiding it (so admins know the affordance is coming, just not
// available yet for this submission).

import { Button } from '@/components/ui';

interface PdfDownloadStubProps {
  submissionId: string;
  /** True iff submission.status === 'submitted'. */
  available: boolean;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

export function PdfDownloadStub({
  submissionId,
  available,
}: PdfDownloadStubProps) {
  if (!available) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        title="PDF is available once the form has been submitted."
      >
        Download PDF
      </Button>
    );
  }

  // Plain anchor styled to match the Button visual — Button itself wraps
  // <button>, which can't carry an href. Opening in a new tab + inline
  // disposition (set server-side) lets the browser's PDF viewer handle it
  // without leaving the admin page.
  const href = `${API_BASE_URL}/admin/intake-form-submissions/${submissionId}/pdf`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-s2 font-sans font-medium px-[14px] py-[7px] text-[13px] rounded-sm bg-transparent text-ink hover:bg-surface-2 transition-[background-color,transform,box-shadow] duration-fast hover:-translate-y-px hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:shadow-focus no-underline"
    >
      Download PDF
    </a>
  );
}
