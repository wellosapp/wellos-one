import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getIntakeFormDefinition } from '@/lib/api/intake-forms';

import { IntakeFormEditor } from '../IntakeFormEditor';

export default async function IntakeFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const { definition } = await getIntakeFormDefinition(id);
    return (
      <div>
        <Link
          href="/admin/intake-forms"
          className="t-body-sm text-accent hover:underline"
        >
          ← All intake forms
        </Link>
        <div className="mt-s4">
          <IntakeFormEditor definition={definition} />
        </div>
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}
