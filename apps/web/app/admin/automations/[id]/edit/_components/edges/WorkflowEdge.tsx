'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';

import { cn } from '@/lib/cn';

import {
  edgeIsAnimated,
  edgeStatusClass,
  readRunStatus,
  type RunStatus,
} from '../runStatus';

// Custom edge for the workflow canvas. PR 9 of the Automation System epic.
//
// Two responsibilities beyond React Flow's default edge:
//   1. Auto-derive a visible label from `sourceHandle` when no explicit
//      `label` is set on the edge — condition handles emit 'true' / 'false',
//      branch handles emit the branch's label, etc. Saves users from having
//      to label every edge manually.
//   2. Apply the per-edge runStatus visual treatment: stroke color, width,
//      and the animated flow pattern when the engine is currently walking
//      this edge in a test run. PR 10 (test mode) is what populates the
//      status; until then every edge renders as 'idle'.
//
// Also: edges sourced from a delay node render dashed by default so a
// "wait then continue" gap is visible without users having to remember
// which node was a delay.

export type WorkflowEdgeData = {
  runStatus?: RunStatus;
};

// Tone of the auto-derived label. The condition true/false labels read as
// outcomes; everything else is neutral.
function labelTone(label: string): 'true' | 'false' | 'neutral' {
  if (label === 'true') return 'true';
  if (label === 'false') return 'false';
  return 'neutral';
}

function tokenizeSourceHandle(
  sourceHandle: string | null | undefined,
): string | null {
  if (!sourceHandle) return null;
  // 'default' branches render no label — the user picks "default" exactly
  // because they don't want a labeled path.
  if (sourceHandle === 'default') return null;
  return sourceHandle;
}

export function WorkflowEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  label,
  data,
  markerEnd,
}: EdgeProps) {
  const { getNode } = useReactFlow();
  const sourceNode = getNode(source);
  const isFromDelay = sourceNode?.type === 'delay';

  const runStatus = readRunStatus(data);
  const animated = edgeIsAnimated(runStatus);
  const statusClass = edgeStatusClass(runStatus);

  // Smoothstep — n8n-style right-angle paths with rounded corners. Looks
  // less noisy than bezier on dense graphs with many parallel branches.
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const derivedLabel: string | null =
    (typeof label === 'string' && label.length > 0
      ? label
      : tokenizeSourceHandle(sourceHandleId)) ?? null;

  const tone = derivedLabel ? labelTone(derivedLabel) : 'neutral';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={cn(
          'stroke-[1.5] stroke-line-strong',
          statusClass,
          // Delay-sourced edges render dashed always. When the edge is in a
          // non-idle run state, the status stroke color takes over and the
          // dash remains as a temporal hint. `wellos-edge-flow` also sets
          // the dasharray + adds the animation — applied for running edges
          // regardless of source type.
          isFromDelay && !animated && 'wellos-edge-dashed',
          animated && 'wellos-edge-flow',
        )}
      />
      {derivedLabel ? (
        <EdgeLabelRenderer>
          <div
            // React Flow's edges live in an SVG layer; labels render in a
            // sibling div layer positioned via translate.
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={cn(
              'inline-flex items-center rounded-sm border px-s2 py-[2px]',
              't-caption font-medium',
              'bg-white',
              tone === 'true' && 'border-green text-green',
              tone === 'false' && 'border-red text-red',
              tone === 'neutral' && 'border-surface-3 text-ink-soft',
            )}
          >
            {derivedLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
