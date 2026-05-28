'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  archiveAutomationWorkflow,
  createAutomationWorkflow,
  updateAutomationWorkflow,
} from '@/lib/api/automation-workflows';

export type CreateAutomationResult =
  | { ok: true; workflowId: string }
  | { ok: false; error: string };

export async function createAutomationAction(input: {
  name: string;
  description?: string;
  triggerType: string;
}): Promise<CreateAutomationResult> {
  const name = input.name?.trim();
  const triggerType = input.triggerType?.trim();
  if (!name) return { ok: false, error: 'Name is required.' };
  if (!triggerType) return { ok: false, error: 'Trigger type is required.' };

  try {
    const { workflow } = await createAutomationWorkflow({
      name,
      description: input.description?.trim() || undefined,
      triggerType,
    });
    revalidatePath('/admin/automations');
    return { ok: true, workflowId: workflow.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not create workflow.',
    };
  }
}

export type SaveAutomationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveAutomationWorkflowAction(
  workflowId: string,
  body: { workflowJson?: unknown; name?: string; triggerType?: string },
): Promise<SaveAutomationResult> {
  try {
    await updateAutomationWorkflow(workflowId, {
      workflowJson: body.workflowJson,
      name: body.name,
      triggerType: body.triggerType,
    });
    revalidatePath('/admin/automations');
    revalidatePath(`/admin/automations/${workflowId}/edit`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not save workflow.',
    };
  }
}

export async function archiveAutomationWorkflowAction(
  workflowId: string,
): Promise<SaveAutomationResult> {
  try {
    await archiveAutomationWorkflow(workflowId);
    revalidatePath('/admin/automations');
    revalidatePath(`/admin/automations/${workflowId}/edit`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not archive workflow.',
    };
  }
}

export async function restoreAutomationWorkflowAction(
  workflowId: string,
): Promise<SaveAutomationResult> {
  try {
    await updateAutomationWorkflow(workflowId, { status: 'draft' });
    revalidatePath('/admin/automations');
    revalidatePath(`/admin/automations/${workflowId}/edit`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not restore workflow.',
    };
  }
}
