import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getAutomationWorkflow } from '@/lib/api/automation-workflows';

import { WorkflowCanvasShell } from './_components/WorkflowCanvasShell';

// /admin/automations/[id]/edit — Automation System PR 6.
//
// Canvas page. Empty React Flow canvas with pan/zoom/minimap. Save/load
// workflow_json. Trigger node placeholder visible; no palette, no settings
// drawer, no test mode — those land in PRs 7-10.

export default async function AutomationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { workflow } = await getAutomationWorkflow(id);
    return <WorkflowCanvasShell workflow={workflow} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}
