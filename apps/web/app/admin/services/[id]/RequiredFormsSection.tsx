'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { FormAssignmentRule } from '@/lib/api/service-form-rules';

import { AttachFormModal, type FormGroupOption } from './AttachFormModal';
import { deleteServiceFormRuleAction } from './_actions';

interface Props {
  serviceId: string;
  rules: FormAssignmentRule[];
  /** All tenant-published form groups (one entry per distinct groupId). */
  allGroups: FormGroupOption[];
}

const REQUIRED_LEVEL_LABEL: Record<FormAssignmentRule['requiredLevel'], string> = {
  optional: 'Optional',
  soft_required: 'Soft required',
  hard_required: 'Hard required',
};

const REQUIRED_LEVEL_TONE: Record<
  FormAssignmentRule['requiredLevel'],
  'neutral' | 'amber' | 'accent'
> = {
  optional: 'neutral',
  soft_required: 'accent',
  hard_required: 'amber',
};

const TIMING_LABEL: Record<FormAssignmentRule['timing'], string> = {
  before_booking: 'Before booking',
  before_appointment: 'Before appointment',
  optional: 'Manual',
};

export function RequiredFormsSection({ serviceId, rules, allGroups }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; rule: FormAssignmentRule }
    | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const attachedGroupIds = new Set(rules.map((r) => r.formDefinitionGroupId));
  const availableGroupsForCreate = allGroups.filter(
    (g) => !attachedGroupIds.has(g.groupId),
  );

  function handleDelete(ruleId: string) {
    if (!confirm('Remove this form from the service?')) return;
    setDeletingId(ruleId);
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteServiceFormRuleAction(serviceId, ruleId);
      setDeletingId(null);
      if (!res.ok) {
        setDeleteError(res.error ?? 'Could not delete rule.');
        return;
      }
      // Server revalidatePath fires from the action; tell Next to refresh
      // server components for this page so the rule list re-renders.
      router.refresh();
    });
  }

  function handleModalClose() {
    setModal(null);
    router.refresh();
  }

  return (
    <Card padding="lg" className="flex flex-col gap-s4">
      <header className="flex flex-wrap items-start justify-between gap-s3">
        <div className="flex flex-col gap-s1">
          <h2 className="t-display-sm">Required forms</h2>
          <p className="t-body-sm text-ink-soft">
            Attach intake, waiver, or consent forms that should be sent to clients
            after they book this service. Hard-required blocking lands in a follow-up PR.
          </p>
        </div>
        <Button
          type="button"
          variant="accent"
          size="md"
          onClick={() => setModal({ mode: 'create' })}
          disabled={availableGroupsForCreate.length === 0}
        >
          + Attach form
        </Button>
      </header>

      {deleteError ? (
        <Alert tone="error" title="Could not remove form">
          {deleteError}
        </Alert>
      ) : null}

      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-surface-3 px-s5 py-s6 text-center">
          <p className="t-body-md text-ink">No forms attached.</p>
          <p className="mt-s1 t-body-sm text-ink-soft">
            Add a form so it&apos;s sent to clients after they book.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-surface-3">
          <table className="w-full text-left">
            <thead className="bg-surface-2 t-caption uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-s4 py-s3 font-medium">Form</th>
                <th className="px-s4 py-s3 font-medium">Required</th>
                <th className="px-s4 py-s3 font-medium">Timing</th>
                <th className="px-s4 py-s3 font-medium">Auto-send</th>
                <th className="px-s4 py-s3 font-medium">Status</th>
                <th className="px-s4 py-s3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-3">
              {rules.map((rule) => {
                const unpublished = rule.formTitle === '(unpublished form)';
                return (
                  <tr key={rule.id} className={unpublished ? 'bg-amber-pale/40' : ''}>
                    <td className="px-s4 py-s3 align-top">
                      <div className="flex flex-col gap-s1">
                        <span
                          className={cn(
                            't-body-md text-ink',
                            unpublished && 'text-amber',
                          )}
                        >
                          {rule.formTitle}
                        </span>
                        {rule.formType && rule.formType !== 'unknown' ? (
                          <span className="t-caption text-ink-soft">
                            {rule.formType}
                          </span>
                        ) : null}
                        {unpublished ? (
                          <span className="t-caption text-amber">
                            This form has no published version. Publish it from{' '}
                            <code>/admin/intake-forms</code> or remove this rule.
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-s4 py-s3 align-top">
                      <Badge tone={REQUIRED_LEVEL_TONE[rule.requiredLevel]}>
                        {REQUIRED_LEVEL_LABEL[rule.requiredLevel]}
                      </Badge>
                    </td>
                    <td className="px-s4 py-s3 align-top t-body-sm text-ink-soft">
                      {TIMING_LABEL[rule.timing]}
                    </td>
                    <td className="px-s4 py-s3 align-top t-body-sm text-ink-soft">
                      {rule.sendAutomaticallyAfterBooking ? 'Yes' : 'No'}
                    </td>
                    <td className="px-s4 py-s3 align-top">
                      {rule.active ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-s4 py-s3 align-top">
                      <div className="flex items-center justify-end gap-s2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setModal({ mode: 'edit', rule })}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                          loading={deletingId === rule.id}
                          className="text-red hover:bg-red-pale"
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal?.mode === 'create' ? (
        <AttachFormModal
          serviceId={serviceId}
          availableGroups={availableGroupsForCreate}
          onClose={handleModalClose}
        />
      ) : null}

      {modal?.mode === 'edit' ? (
        <AttachFormModal
          serviceId={serviceId}
          // Locked picker in edit mode — still pass the rule's own group so it
          // renders (avoid a stale option list flicker).
          availableGroups={allGroups}
          rule={modal.rule}
          onClose={handleModalClose}
        />
      ) : null}
    </Card>
  );
}
