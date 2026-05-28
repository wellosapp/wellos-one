// Run-status visual primitives for the workflow canvas. PR 9 of the
// Automation System epic.
//
// PR 9 ships the *rendering* tier — node renderers and the custom edge
// component read the status from the canvas-merged data and apply a CSS
// treatment. PR 10 (test mode) is what actually populates these values
// from a running execution; until then, every node + edge sees `idle`.
//
// The status union mirrors AutomationNodeRun.status from PR 1's schema,
// plus a `waiting` status the engine doesn't write directly but the canvas
// uses to render an in-progress delay or queued action.

export type RunStatus =
  | 'idle'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'waiting'
  | 'filtered';

/**
 * Per-node CSS treatment string. Composed onto the node's outer card.
 * Keeps the visual contract one place so a future status (e.g. 'retrying'
 * from PR 20) only has to be added here.
 */
export function nodeStatusClass(status: RunStatus | undefined): string {
  switch (status) {
    case 'running':
      return 'ring-2 ring-accent ring-offset-2 ring-offset-surface-2 animate-pulse';
    case 'succeeded':
      return 'ring-2 ring-green ring-offset-1 ring-offset-surface-2';
    case 'failed':
      return 'ring-2 ring-red ring-offset-1 ring-offset-surface-2';
    case 'skipped':
      return 'opacity-50 grayscale';
    case 'waiting':
      return 'ring-2 ring-amber ring-offset-1 ring-offset-surface-2';
    case 'filtered':
      return 'opacity-60';
    case 'idle':
    case undefined:
    default:
      return '';
  }
}

/**
 * Per-edge CSS class for the SVG <path>. The custom WorkflowEdge component
 * composes this against its base stroke. 'running' and 'succeeded' edges
 * use the accent color; failed edges go red; idle stays the React Flow
 * default neutral gray.
 */
export function edgeStatusClass(status: RunStatus | undefined): string {
  switch (status) {
    case 'running':
      return 'stroke-accent stroke-[2.5]';
    case 'succeeded':
      return 'stroke-accent stroke-[2]';
    case 'failed':
      return 'stroke-red stroke-[2]';
    case 'skipped':
    case 'filtered':
      return 'opacity-40';
    case 'waiting':
      return 'stroke-amber stroke-[2]';
    case 'idle':
    case undefined:
    default:
      return '';
  }
}

/**
 * True for statuses that should render with an animated flow pattern. PR 9's
 * WorkflowEdge applies the `wellos-edge-flow` keyframes when this is true.
 */
export function edgeIsAnimated(status: RunStatus | undefined): boolean {
  return status === 'running' || status === 'waiting';
}

/**
 * Convenience reader for `node.data.runStatus`. The canvas merges the
 * status from the runStatus props into each node's data at render time so
 * the renderers don't need a parallel React context.
 */
export function readRunStatus(data: unknown): RunStatus | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const status = (data as { runStatus?: unknown }).runStatus;
  if (typeof status !== 'string') return undefined;
  if (
    status === 'idle' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'skipped' ||
    status === 'waiting' ||
    status === 'filtered'
  ) {
    return status;
  }
  return undefined;
}
