// Edge-connection validation for the workflow canvas. Pure function so PR 10
// (test mode) can reuse it for sanity-checking template payloads + unit tests
// can exercise the rules without spinning up React Flow.
//
// Rules:
//   1. No self-loops (source !== target).
//   2. The trigger node cannot be a target (the engine always starts there).
//   3. Each (source, sourceHandle) pair has at most one outgoing edge — the
//      engine walks a single path per source handle. Branches expose multiple
//      handles instead of multiple edges off one handle.
//
// What we deliberately do NOT enforce here:
//   - Cycles: the engine has a per-run node-visit limit. A canvas-side cycle
//     check would prevent intentional retry loops that PR 19 may introduce.
//   - Multiple inbound edges to the same node: convergence is rare but legal.
//   - Handle existence on the target side. React Flow only fires onConnect
//     when target handles resolve, so this is already enforced by the lib.

export interface ValidationEdgeSummary {
  source: string;
  sourceHandle?: string | null;
}

export interface ValidationInput {
  source: string;
  target: string;
  sourceHandle?: string | null;
  /** Existing edges on the canvas — used for the one-edge-per-handle check. */
  existingEdges: readonly ValidationEdgeSummary[];
  /** Id of the workflow's trigger node — that node may not be a target. */
  triggerNodeId: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateConnection(input: ValidationInput): ValidationResult {
  const { source, target, sourceHandle, existingEdges, triggerNodeId } = input;

  if (source === target) {
    return { ok: false, reason: 'A node cannot connect to itself.' };
  }

  if (target === triggerNodeId) {
    return { ok: false, reason: 'The trigger node cannot have an inbound connection.' };
  }

  const handle = sourceHandle ?? null;
  const conflict = existingEdges.some(
    (e) => e.source === source && (e.sourceHandle ?? null) === handle,
  );
  if (conflict) {
    return {
      ok: false,
      reason: 'This output already has an outgoing connection.',
    };
  }

  return { ok: true };
}
