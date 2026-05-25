import Link from 'next/link';
import type { Route } from 'next';

import { Badge, Card } from '@/components/ui';
import type {
  ByDay,
  RecurrenceRuleWithRelations,
} from '@/lib/api/recurrence-rules';
import { cn } from '@/lib/cn';

import { GenerateInstancesButton } from './GenerateInstancesButton';
import { ToggleRuleActiveButton } from './ToggleRuleActiveButton';

// /admin/classes/[id]/schedule — Phase 2b list section.
// Shows the recurrence rules attached to this class. Each row has:
//   day-of-week chips (selected days highlighted), local time + duration,
//   instructor + location, date range, active/paused badge, and per-row
//   actions: Edit, Pause/Resume, Generate next 12 weeks.
//
// Server component — renders the list with bound server-action wrappers
// for Pause/Resume + Generate. The Edit action is just a Link to
// ?ruleId=<id>; the editor mounts client-side from there.

type Props = {
  classId: string;
  rules: RecurrenceRuleWithRelations[];
};

const DAYS_OF_WEEK: { code: ByDay; label: string }[] = [
  { code: 'SU', label: 'S' },
  { code: 'MO', label: 'M' },
  { code: 'TU', label: 'T' },
  { code: 'WE', label: 'W' },
  { code: 'TH', label: 'T' },
  { code: 'FR', label: 'F' },
  { code: 'SA', label: 'S' },
];

function staffName(staff: RecurrenceRuleWithRelations['staff']): string {
  return `${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`;
}

function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// "2026-06-01" → "Jun 1, 2026". The wire format is UTC midnight; pulling
// the date from the ISO prefix avoids local-timezone shift surprises.
function formatIsoDateLabel(iso: string): string {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return datePart;
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[m - 1]} ${d}, ${y}`;
}

function dateRangeLabel(startIso: string, endIso: string | null): string {
  const start = formatIsoDateLabel(startIso);
  if (!endIso) return `Starts ${start}`;
  return `${start} → ${formatIsoDateLabel(endIso)}`;
}

function ChipRow({ selected }: { selected: ByDay[] }) {
  const selectedSet = new Set(selected);
  return (
    <div className="flex items-center gap-s1">
      {DAYS_OF_WEEK.map(({ code, label }, idx) => {
        const on = selectedSet.has(code);
        return (
          <span
            key={`${code}-${idx}`}
            className={cn(
              'inline-flex h-[24px] w-[24px] items-center justify-center rounded-sm',
              't-caption font-medium',
              on
                ? 'bg-accent-pale text-accent'
                : 'bg-surface-2 text-ink-soft opacity-50',
            )}
            aria-label={code}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function RecurrenceRulesList({ classId, rules }: Props) {
  if (rules.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <div className="flex flex-col items-center gap-s3">
          <h3 className="t-display-sm">No recurring schedules yet.</h3>
          <p className="t-body-md text-ink-soft max-w-md">
            Set up a recurrence rule to schedule a class on a repeating cadence
            (e.g. every Monday + Wednesday at 9am). The system materialises
            the per-occurrence instances in batches you can review on the
            calendar.
          </p>
          <Link
            href={`/admin/classes/${classId}/schedule?newRule=1` as Route}
            className="t-body-md text-accent font-medium no-underline hover:underline"
          >
            + Add recurrence rule
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="sm" className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-surface-3 bg-surface-2 px-s4 py-s3">
        <span className="t-eyebrow text-ink-soft">Recurrence rules</span>
        <Link
          href={`/admin/classes/${classId}/schedule?newRule=1` as Route}
          className="t-body-sm text-accent font-medium no-underline hover:underline"
        >
          + Add recurrence rule
        </Link>
      </div>
      <ul className="divide-y divide-surface-3">
        {rules.map((rule) => {
          const editHref =
            `/admin/classes/${classId}/schedule?ruleId=${rule.id}` as Route;
          return (
            <li
              key={rule.id}
              className="flex flex-col gap-s3 px-s4 py-s4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-s2">
                <div className="flex items-center gap-s3">
                  <ChipRow selected={rule.byday} />
                  <span className="t-body-md font-medium">
                    {formatTime12(rule.startTime)}
                  </span>
                  <span className="t-caption text-ink-soft">
                    · {rule.durationMinutes} min
                  </span>
                  {rule.active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Paused</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-s3 t-body-sm text-ink-soft">
                  <span>{staffName(rule.staff)}</span>
                  <span>·</span>
                  <span>{rule.location.name}</span>
                  <span>·</span>
                  <span>{dateRangeLabel(rule.startDate, rule.endDate)}</span>
                  <span>·</span>
                  <span>{rule.timezone}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-s3 md:flex-nowrap">
                <Link
                  href={editHref}
                  className="t-body-sm text-accent no-underline hover:underline"
                >
                  Edit
                </Link>
                <ToggleRuleActiveButton
                  classId={classId}
                  ruleId={rule.id}
                  active={rule.active}
                />
                <GenerateInstancesButton
                  classId={classId}
                  ruleId={rule.id}
                  disabled={!rule.active}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
