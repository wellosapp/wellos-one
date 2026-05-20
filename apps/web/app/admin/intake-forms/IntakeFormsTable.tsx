import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { IntakeFormDefinitionDto } from '@/lib/api/intake-forms';

import {
  formatIntakeFormDate,
  intakeFormDescriptionLine,
  intakeStatusLabel,
  intakeStatusTone,
} from './intake-forms-dashboard-helpers';

const editButtonClassName = cn(
  'inline-flex items-center justify-center gap-s2 font-sans font-medium',
  'transition-[background-color,transform,box-shadow] duration-fast',
  'focus-visible:outline-none focus-visible:shadow-focus',
  'hover:-translate-y-px hover:shadow-md cursor-pointer',
  'rounded-md px-s4 py-[8px] text-[14px] bg-accent text-white hover:bg-accent-mid',
);

type Props = {
  definitions: IntakeFormDefinitionDto[];
};

export function IntakeFormsTable({ definitions }: Props) {
  if (definitions.length === 0) {
    return (
      <Card padding="lg" className="rounded-2xl border border-surface-3 bg-white shadow-sm">
        <h2 className="font-display t-heading-md text-ink">All versions</h2>
        <p className="mt-s4 t-body-md text-ink-soft">
          No forms match these filters. Adjust search or create a new draft.
        </p>
      </Card>
    );
  }

  return (
    <Card
      padding="sm"
      className="overflow-hidden rounded-2xl border border-surface-3 bg-white p-0 shadow-sm"
    >
      <div className="border-b border-surface-3 px-s5 py-s4">
        <h2 className="font-display t-heading-md text-ink">All versions</h2>
        <p className="mt-s1 max-w-3xl t-body-sm text-ink-soft">
          Each row is one version. Versions that share a group id are the same form over time.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-surface-3 bg-surface-2">
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Form</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Version</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Visibility</th>
              <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Last modified</th>
              <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">Actions</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((d) => (
              <tr
                key={d.id}
                className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2/80"
              >
                <td className="px-s4 py-s4 align-top">
                  <div className="flex flex-col gap-s1">
                    <span className="t-body-md font-medium text-ink">{d.title}</span>
                    <span className="max-w-md t-caption leading-snug text-ink-soft">
                      {intakeFormDescriptionLine(d.schema)}
                    </span>
                  </div>
                </td>
                <td className="px-s4 py-s4 align-top">
                  <Badge tone={intakeStatusTone(d.status)}>{intakeStatusLabel(d.status)}</Badge>
                </td>
                <td className="px-s4 py-s4 align-top">
                  <span className="t-body-sm tabular-nums text-ink">v{d.version}</span>
                </td>
                <td className="px-s4 py-s4 align-top">
                  {d.isActive ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Hidden</Badge>
                  )}
                </td>
                <td className="px-s4 py-s4 align-top">
                  <span className="t-body-sm text-ink-soft whitespace-nowrap">
                    {formatIntakeFormDate(d.updatedAt)}
                  </span>
                </td>
                <td className="px-s4 py-s4 align-top">
                  <div className="flex flex-col items-end gap-s2 sm:flex-row sm:justify-end sm:gap-s3">
                    <Link href={`/admin/intake-forms/${d.id}`} className={`${editButtonClassName} no-underline`}>
                      Edit
                    </Link>
                    <Link
                      href={`/admin/intake-forms?groupId=${encodeURIComponent(d.groupId)}`}
                      className="t-body-sm text-accent no-underline hover:underline"
                    >
                      Same family
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
