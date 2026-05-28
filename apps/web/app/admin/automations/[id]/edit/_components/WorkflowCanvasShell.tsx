'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AutomationWorkflowDetail } from '@/lib/api/automation-workflows';

import {
  archiveAutomationWorkflowAction,
  saveAutomationWorkflowAction,
} from '../../../_actions';
import { WorkflowStatusBadge } from '../../../_components/WorkflowStatusBadge';
import { PaletteSidebar } from './PaletteSidebar';
import { WorkflowCanvas } from './WorkflowCanvas';
import type { CanvasGraph, FlowEdge, FlowNode } from './WorkflowCanvas';

// PR 6 chrome around the React Flow canvas. Owns the live editing buffer
// (name + nodes + edges) and persists via the server actions.
//
// Save semantics: explicit Save button. Debounced autosave can ship later
// (PR 10 with test mode is a good spot).

interface Props {
  workflow: AutomationWorkflowDetail;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// Parse the persisted workflowJson into React Flow's nodes/edges. The
// persisted shape (from PR 2's parseWorkflowJson) already matches RF's
// expectations — id, type, position, data — but we narrow + default safely.
function toCanvasGraph(workflowJson: unknown): CanvasGraph {
  if (
    !workflowJson ||
    typeof workflowJson !== 'object' ||
    !('nodes' in workflowJson) ||
    !('edges' in workflowJson)
  ) {
    // Defensive fallback — the API shouldn't return malformed JSON, but
    // returning an empty graph beats crashing the page.
    return {
      nodes: [],
      edges: [],
      triggerNodeId: 'trigger-1',
    };
  }
  const raw = workflowJson as {
    nodes?: unknown;
    edges?: unknown;
    triggerNodeId?: unknown;
  };
  const nodes: FlowNode[] = Array.isArray(raw.nodes)
    ? raw.nodes.map((n) => {
        const node = n as {
          id?: string;
          type?: string;
          position?: { x?: number; y?: number };
          data?: unknown;
        };
        return {
          id: String(node.id ?? ''),
          type: typeof node.type === 'string' ? node.type : 'trigger',
          position: {
            x: typeof node.position?.x === 'number' ? node.position.x : 0,
            y: typeof node.position?.y === 'number' ? node.position.y : 0,
          },
          data: (node.data ?? {}) as Record<string, unknown>,
        };
      })
    : [];
  const edges: FlowEdge[] = Array.isArray(raw.edges)
    ? raw.edges.map((e) => {
        const edge = e as {
          id?: string;
          source?: string;
          target?: string;
          sourceHandle?: string;
          label?: string;
        };
        return {
          id: String(edge.id ?? ''),
          source: String(edge.source ?? ''),
          target: String(edge.target ?? ''),
          sourceHandle: edge.sourceHandle,
          label: edge.label,
        };
      })
    : [];
  return {
    nodes,
    edges,
    triggerNodeId:
      typeof raw.triggerNodeId === 'string' ? raw.triggerNodeId : 'trigger-1',
  };
}

// Convert React Flow's runtime nodes/edges back to the persisted shape.
// React Flow nodes carry extra UI metadata (selected, dragging) which we
// strip to keep workflow_json clean.
function toWorkflowJson(graph: CanvasGraph): unknown {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      data: n.data,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.label ? { label: e.label } : {}),
    })),
    triggerNodeId: graph.triggerNodeId,
  };
}

export function WorkflowCanvasShell({ workflow }: Props) {
  const router = useRouter();
  const initialGraph = useMemo(
    () => toCanvasGraph(workflow.workflowJson),
    [workflow.workflowJson],
  );
  const [graph, setGraph] = useState<CanvasGraph>(initialGraph);
  const [name, setName] = useState(workflow.name);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archivePending, startArchive] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const isArchived = workflow.status === 'archived';
  const readOnly = isArchived;

  const onGraphChange = useCallback((next: CanvasGraph) => {
    setGraph(next);
    setSaveState('idle');
  }, []);

  const onSave = useCallback(() => {
    setSaveError(null);
    setSaveState('saving');
    void (async () => {
      const res = await saveAutomationWorkflowAction(workflow.id, {
        workflowJson: toWorkflowJson(graph),
        name: name.trim() || undefined,
      });
      if (!res.ok) {
        setSaveState('error');
        setSaveError(res.error);
        return;
      }
      setSaveState('saved');
      // Soft refresh so the list page picks up the new updatedAt next time.
      router.refresh();
    })();
  }, [graph, name, router, workflow.id]);

  const onArchive = useCallback(() => {
    if (!confirm('Archive this workflow? It will stop running.')) return;
    setArchiveError(null);
    startArchive(async () => {
      const res = await archiveAutomationWorkflowAction(workflow.id);
      if (!res.ok) {
        setArchiveError(res.error);
        return;
      }
      router.push('/admin/automations' as Route);
    });
  }, [router, workflow.id]);

  return (
    <div className="flex h-[calc(100vh-32px)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-s4 border-b border-surface-3 bg-white px-s6 py-s3">
        <Link
          href={'/admin/automations' as Route}
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to automations
        </Link>

        <div className="flex flex-1 items-center gap-s3 min-w-0">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaveState('idle');
            }}
            disabled={readOnly}
            aria-label="Workflow name"
            className={cn(
              'min-w-0 flex-1 bg-transparent font-display t-heading-md text-ink',
              'border-0 border-b-[1.5px] border-transparent',
              'focus:border-accent focus:outline-none',
              'disabled:opacity-60',
            )}
            placeholder="Untitled workflow"
          />
          <WorkflowStatusBadge status={workflow.status} />
        </div>

        <div className="flex items-center gap-s3">
          <SaveStatusIndicator state={saveState} error={saveError} />
          {!isArchived ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onArchive}
                loading={archivePending}
                className="border border-surface-3"
              >
                Archive
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={onSave}
                loading={saveState === 'saving'}
              >
                Save
              </Button>
            </>
          ) : (
            <span className="t-body-sm text-ink-soft">
              Archived — restore from the list to edit.
            </span>
          )}
        </div>

        {archiveError ? (
          <div className="w-full t-caption text-red">{archiveError}</div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 bg-surface-2">
        {!readOnly ? <PaletteSidebar /> : null}
        <div className="min-h-0 flex-1">
          <WorkflowCanvas
            initialGraph={initialGraph}
            readOnly={readOnly}
            onChange={onGraphChange}
          />
        </div>
      </div>
    </div>
  );
}

function SaveStatusIndicator({
  state,
  error,
}: {
  state: SaveState;
  error: string | null;
}) {
  if (state === 'idle') return null;
  if (state === 'saving') {
    return <span className="t-caption text-ink-soft">Saving…</span>;
  }
  if (state === 'saved') {
    return <span className="t-caption text-green">Saved</span>;
  }
  return (
    <span className="t-caption text-red" title={error ?? undefined}>
      Couldn&apos;t save{error ? `: ${error}` : ''}
    </span>
  );
}
