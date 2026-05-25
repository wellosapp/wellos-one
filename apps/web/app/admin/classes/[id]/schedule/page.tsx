import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { Alert, Card } from '@/components/ui';
import {
  listClassInstances,
  type ClassInstanceWithRelations,
} from '@/lib/api/class-instances';
import { getClass } from '@/lib/api/classes';
import { ApiError } from '@/lib/api/client';
import {
  listRecurrenceRules,
  type RecurrenceRuleWithRelations,
} from '@/lib/api/recurrence-rules';
import { listStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';

import { AddInstanceForm } from './AddInstanceForm';
import { InstancesTable } from './InstancesTable';
import { RecurrenceRuleEditor } from './RecurrenceRuleEditor';
import { RecurrenceRulesList } from './RecurrenceRulesList';
import {
  createInstanceAction,
  createRecurrenceRuleAction,
  updateRecurrenceRuleAction,
} from './_actions';

// /admin/classes/[id]/schedule — Phase 2a of the Classes epic.
// Manual scheduling surface for a class's one-off occurrences. The full
// recurring scheduler + cron land in Phase 2b; bookings + check-in in
// Phase 3-4. Each instance also surfaces on /admin/calendar as a chip.

// Show recent past instances (last 30 days) + everything from today forward,
// so cancelled/completed ones a few days back stay visible briefly for
// reconciliation work.
const HISTORY_WINDOW_DAYS = 30;

export default async function ClassSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ruleId?: string; newRule?: string }>;
}) {
  const { id } = await params;
  const { ruleId, newRule } = await searchParams;
  const editorMode: 'create' | 'edit' | null = ruleId
    ? 'edit'
    : newRule === '1'
      ? 'create'
      : null;

  let className: string;
  try {
    const result = await getClass(id);
    className = result.class.name;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const now = new Date();
  const historyFrom = new Date(
    now.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Fetch the class detail (for instructors), tenant staff (to resolve
  // names for the picker), whoami (for locations), the instances for this
  // class, and the recurrence rules in parallel.
  let classDetail: Awaited<ReturnType<typeof getClass>>['class'] | null = null;
  let staffData: Awaited<ReturnType<typeof listStaff>> | null = null;
  let whoami: Awaited<ReturnType<typeof getWhoami>> | null = null;
  let instancesData: Awaited<ReturnType<typeof listClassInstances>> | null =
    null;
  let rulesData: Awaited<ReturnType<typeof listRecurrenceRules>> | null = null;
  let directoryError: string | null = null;

  try {
    [classDetail, staffData, whoami, instancesData, rulesData] =
      await Promise.all([
        getClass(id).then((r) => r.class),
        listStaff({ active: true, take: 200 }),
        getWhoami(),
        listClassInstances({
          classId: id,
          fromDate: historyFrom.toISOString(),
          take: 200,
        }),
        listRecurrenceRules({ classId: id, take: 100 }),
      ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      directoryError = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      directoryError = err.message;
    } else {
      throw err;
    }
  }

  const createAction = createInstanceAction.bind(null, id);

  // Filter staff to the class's instructor pool only. The class detail
  // endpoint returns instructor staff IDs; we resolve them against the
  // tenant's staff directory for names + job title.
  const instructorStaffIds = new Set(
    classDetail?.instructors.map((i) => i.staffId) ?? [],
  );
  const instructorOptions = (staffData?.staff ?? [])
    .filter((s) => instructorStaffIds.has(s.id))
    .map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      jobTitle: s.jobTitle,
    }));

  const locations = whoami?.locations ?? [];

  const instances: ClassInstanceWithRelations[] =
    instancesData?.instances ?? [];

  const rules: RecurrenceRuleWithRelations[] = rulesData?.rules ?? [];

  // Resolve the editing rule (if any). If ?ruleId points at a row we don't
  // have, we fall back to create mode rather than 404 — the operator can
  // still create a new rule from the same screen.
  const editingRule =
    editorMode === 'edit' && ruleId
      ? (rules.find((r) => r.id === ruleId) ?? null)
      : null;
  const effectiveEditorMode: 'create' | 'edit' | null =
    editorMode === 'edit' && !editingRule ? 'create' : editorMode;

  const editorInitial = editingRule
    ? {
        staffId: editingRule.staffId,
        locationId: editingRule.locationId,
        startDate: editingRule.startDate.slice(0, 10),
        endDate: editingRule.endDate
          ? editingRule.endDate.slice(0, 10)
          : undefined,
        byday: editingRule.byday,
        startTime: editingRule.startTime,
        durationMinutes: String(editingRule.durationMinutes),
        timezone: editingRule.timezone,
      }
    : undefined;

  const editorAction =
    effectiveEditorMode === 'edit' && editingRule
      ? updateRecurrenceRuleAction.bind(null, id, editingRule.id)
      : createRecurrenceRuleAction.bind(null, id);

  const cancelHref = `/admin/classes/${id}/schedule`;

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href={`/admin/classes/${id}` as Route}
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to class
        </Link>
      </div>

      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Schedule</span>
        <h1 className="t-display-lg">Schedule for {className}.</h1>
        <p className="t-body-md text-ink-soft">
          Upcoming class instances. Add one-off occurrences here; recurring
          schedules land in a follow-up.
        </p>
      </header>

      {directoryError && <Alert tone="error">{directoryError}</Alert>}

      <section className="flex flex-col gap-s3">
        <h2 className="t-display-sm">Recurring schedule</h2>
        <RecurrenceRulesList classId={id} rules={rules} />
      </section>

      {effectiveEditorMode && (
        <section className="flex flex-col gap-s3">
          <h2 className="t-display-sm">
            {effectiveEditorMode === 'edit'
              ? 'Edit recurrence rule'
              : 'New recurrence rule'}
          </h2>
          <Card padding="lg">
            <RecurrenceRuleEditor
              mode={effectiveEditorMode}
              action={editorAction}
              cancelHref={cancelHref}
              instructors={instructorOptions}
              locations={locations.map((l) => ({ id: l.id, name: l.name }))}
              initial={editorInitial}
            />
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-s3">
        <h2 className="t-display-sm">One-off instance</h2>
        <Card padding="lg">
          <AddInstanceForm
            action={createAction}
            instructors={instructorOptions}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-s3">
        <h2 className="t-display-sm">Instances</h2>
        <InstancesTable classId={id} instances={instances} />
      </section>
    </div>
  );
}
