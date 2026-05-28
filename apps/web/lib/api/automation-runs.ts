// Automation System PR 5 — admin run-history viewer API wrappers.
//
// Backs /admin/automations/runs + /admin/automations/runs/[id].

import { apiFetch } from './client';

export type AutomationRunStatusFilter =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'all';

export interface AutomationRunListItem {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerEvent: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  createdAt: string;
}

export interface ListAutomationRunsResult {
  runs: AutomationRunListItem[];
  cursor: string | null;
}

export interface ListAutomationRunsParams {
  status?: AutomationRunStatusFilter;
  workflowId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  take?: number;
}

export interface AutomationNodeRunDto {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  errorMessage: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  nodeLabel: string | null;
}

export interface AutomationRunDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowDescription: string | null;
  triggerEvent: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  contextJson: unknown;
  createdAt: string;
  nodeRuns: AutomationNodeRunDto[];
}

export async function listAutomationRuns(
  params: ListAutomationRunsParams = {},
): Promise<ListAutomationRunsResult> {
  return apiFetch<ListAutomationRunsResult>('/admin/automation-runs', {
    searchParams: {
      status: params.status,
      workflowId: params.workflowId,
      from: params.from,
      to: params.to,
      cursor: params.cursor,
      take: params.take,
    },
  });
}

export async function getAutomationRunDetail(
  runId: string,
): Promise<AutomationRunDetail> {
  return apiFetch<AutomationRunDetail>(`/admin/automation-runs/${runId}`);
}
