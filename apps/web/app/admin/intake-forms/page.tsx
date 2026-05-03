import Link from 'next/link';

import { Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listIntakeFormDefinitions,
  type IntakeFormDefinitionDto,
} from '@/lib/api/intake-forms';

import { CreateBlankIntakeFormButton } from './CreateBlankIntakeFormButton';

export default async function AdminIntakeFormsPage() {
  let definitions: IntakeFormDefinitionDto[] = [];
  let loadError: string | null = null;
  try {
    const res = await listIntakeFormDefinitions({
      includeInactive: true,
    });
    definitions = res.definitions;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load intake forms. Is the API running?';
    definitions = [];
  }

  return (
    <div className="space-y-s6">
      <div className="flex flex-wrap items-end justify-between gap-s4">
        <div>
          <span className="t-eyebrow text-accent">Epic 5</span>
          <h1 className="mt-s2 font-display t-display-sm text-ink">
            Intake forms
          </h1>
          <p className="mt-s2 max-w-2xl t-body-md text-ink-soft">
            Versioned definitions (JSON field templates). Publish a draft to
            allow staff to assign submissions to clients.
          </p>
        </div>
        <CreateBlankIntakeFormButton />
      </div>

      {loadError ? (
        <Card
          padding="md"
          className="border border-amber/30 bg-amber-pale/60 t-body-sm text-amber-950"
        >
          {loadError}
        </Card>
      ) : null}

      <Card padding="lg" className="rounded-2xl border border-surface-3 bg-white shadow-sm">
        <h2 className="font-display t-heading-md text-ink">All versions</h2>
        {definitions.length === 0 ? (
          <p className="mt-s4 t-body-md text-ink-soft">
            No forms yet. Create a blank draft to open the JSON editor.
          </p>
        ) : (
          <div className="mt-s4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left t-body-sm">
              <thead>
                <tr className="border-b border-surface-3 text-ink-soft">
                  <th className="py-s2 pr-s4 font-medium">Title</th>
                  <th className="py-s2 pr-s4 font-medium">Status</th>
                  <th className="py-s2 pr-s4 font-medium">v</th>
                  <th className="py-s2 pr-s4 font-medium">Group</th>
                  <th className="py-s2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((d) => (
                  <tr key={d.id} className="border-b border-surface-3/80">
                    <td className="py-s3 pr-s4">
                      <Link
                        href={`/admin/intake-forms/${d.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {d.title}
                      </Link>
                    </td>
                    <td className="py-s3 pr-s4 capitalize">{d.status}</td>
                    <td className="py-s3 pr-s4 tabular-nums">{d.version}</td>
                    <td className="py-s3 pr-s4 font-mono text-[12px] text-ink-soft">
                      {d.groupId.slice(0, 8)}…
                    </td>
                    <td className="py-s3">{d.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="md" className="border border-dashed border-surface-3 bg-surface-2/40">
        <p className="t-caption text-ink-soft">
          <strong className="text-ink">Follow-ups:</strong> service linkage,
          magic-link client runtime, signature capture to storage, PDF export,
          full visual form builder.
        </p>
      </Card>
    </div>
  );
}
