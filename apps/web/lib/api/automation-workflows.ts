// Automation System PR 6 — admin workflow CRUD API wrappers.
//
// Backs /admin/automations (list) and /admin/automations/[id]/edit (canvas).

import { apiFetch } from './client';

export type AutomationWorkflowStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'archived'
  | 'error';

export type AutomationWorkflowStatusFilter =
  | AutomationWorkflowStatus
  | 'all';

export interface AutomationWorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  triggerType: string;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationWorkflowDetail extends AutomationWorkflowListItem {
  workflowJson: unknown;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ListAutomationWorkflowsResult {
  workflows: AutomationWorkflowListItem[];
  cursor: string | null;
}

export interface ListAutomationWorkflowsParams {
  status?: AutomationWorkflowStatusFilter;
  cursor?: string;
  take?: number;
}

export async function listAutomationWorkflows(
  params: ListAutomationWorkflowsParams = {},
): Promise<ListAutomationWorkflowsResult> {
  return apiFetch<ListAutomationWorkflowsResult>('/admin/automation-workflows', {
    searchParams: {
      status: params.status,
      cursor: params.cursor,
      take: params.take,
    },
  });
}

export async function getAutomationWorkflow(
  id: string,
): Promise<{ workflow: AutomationWorkflowDetail }> {
  return apiFetch<{ workflow: AutomationWorkflowDetail }>(
    `/admin/automation-workflows/${id}`,
  );
}

export async function createAutomationWorkflow(body: {
  name: string;
  description?: string;
  triggerType: string;
}): Promise<{ workflow: AutomationWorkflowDetail }> {
  return apiFetch<{ workflow: AutomationWorkflowDetail }>(
    '/admin/automation-workflows',
    { method: 'POST', body },
  );
}

export async function updateAutomationWorkflow(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    triggerType?: string;
    status?: AutomationWorkflowStatus;
    workflowJson?: unknown;
  },
): Promise<{ workflow: AutomationWorkflowDetail }> {
  return apiFetch<{ workflow: AutomationWorkflowDetail }>(
    `/admin/automation-workflows/${id}`,
    { method: 'PATCH', body },
  );
}

export async function archiveAutomationWorkflow(
  id: string,
): Promise<{ workflow: AutomationWorkflowDetail }> {
  return apiFetch<{ workflow: AutomationWorkflowDetail }>(
    `/admin/automation-workflows/${id}/archive`,
    { method: 'POST', body: {} },
  );
}
