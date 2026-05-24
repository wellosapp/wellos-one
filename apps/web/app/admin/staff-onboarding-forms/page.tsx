import { Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listStaffOnboardingFormDefinitions,
  type StaffOnboardingFormDefinitionDto,
} from '@/lib/api/staff-onboarding-forms';

import { CreateBlankStaffOnboardingFormButton } from './CreateBlankStaffOnboardingFormButton';
import { StaffOnboardingFormsFilters } from './StaffOnboardingFormsFilters';
import {
  countStaffOnboardingFormsByStatus,
  filterStaffOnboardingFormDefinitions,
  type StaffOnboardingFormStatusFilter,
} from './staff-onboarding-forms-dashboard-helpers';
import { StaffOnboardingFormsStatsRow } from './StaffOnboardingFormsStatsRow';
import { StaffOnboardingFormsTable } from './StaffOnboardingFormsTable';

type SearchParams = {
  status?: string;
  q?: string;
  groupId?: string;
};

function parseStatusFilter(v: string | undefined): StaffOnboardingFormStatusFilter {
  if (v === 'draft' || v === 'published' || v === 'archived') {
    return v;
  }
  return '';
}

export default async function AdminStaffOnboardingFormsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = parseStatusFilter(sp.status);
  const q = typeof sp.q === 'string' ? sp.q : '';
  const groupId = typeof sp.groupId === 'string' && sp.groupId.trim() ? sp.groupId.trim() : undefined;

  let allDefinitions: StaffOnboardingFormDefinitionDto[] = [];
  let loadError: string | null = null;
  try {
    const res = await listStaffOnboardingFormDefinitions();
    allDefinitions = res.definitions;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load staff onboarding forms. Is the API running?';
    allDefinitions = [];
  }

  const filtered = filterStaffOnboardingFormDefinitions(allDefinitions, { status, q, groupId });
  const counts = countStaffOnboardingFormsByStatus(allDefinitions);

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-wrap items-end justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Staff onboarding</span>
          <h1 className="font-display t-display-sm text-ink">Staff onboarding forms</h1>
          <p className="mt-s1 max-w-2xl t-body-md text-ink-soft">
            Versioned definitions (JSON field templates) for staff onboarding paperwork. Publish a
            draft to allow staff to fill it out from their Forms tab.
          </p>
        </div>
        <CreateBlankStaffOnboardingFormButton />
      </header>

      {loadError ? (
        <Card
          padding="md"
          className="border border-amber/30 bg-amber-pale/60 t-body-sm text-amber-950"
        >
          {loadError}
        </Card>
      ) : null}

      {!loadError && allDefinitions.length > 0 ? (
        <>
          <StaffOnboardingFormsStatsRow
            total={counts.total}
            draft={counts.draft}
            published={counts.published}
            archived={counts.archived}
          />
          <StaffOnboardingFormsFilters status={status} q={q} groupId={groupId} />
        </>
      ) : null}

      {!loadError && allDefinitions.length === 0 ? (
        <Card padding="lg" className="rounded-2xl border border-surface-3 bg-white shadow-sm">
          <h2 className="font-display t-heading-md text-ink">All versions</h2>
          <p className="mt-s4 t-body-md text-ink-soft">
            No forms yet. Create a blank draft to open the JSON editor.
          </p>
        </Card>
      ) : null}

      {!loadError && allDefinitions.length > 0 ? (
        <StaffOnboardingFormsTable definitions={filtered} />
      ) : null}

      <Card padding="md" className="border border-dashed border-surface-3 bg-surface-2/40">
        <p className="t-caption text-ink-soft">
          <strong className="text-ink">Follow-ups:</strong> assignment to specific staff, signature
          capture to storage, PDF export, full visual form builder.
        </p>
      </Card>
    </div>
  );
}
