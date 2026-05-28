'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import { validateConnection } from './connectionValidation';
import {
  PALETTE_DRAG_MIME,
  findPaletteItem,
  type PaletteNodeType,
} from './paletteCatalog';
import { WorkflowEdge } from './edges/WorkflowEdge';
import { ActionNodeRenderer } from './nodes/ActionNodeRenderer';
import { AiNodeRenderer } from './nodes/AiNodeRenderer';
import { BranchNodeRenderer } from './nodes/BranchNodeRenderer';
import { ConditionNodeRenderer } from './nodes/ConditionNodeRenderer';
import { DelayNodeRenderer } from './nodes/DelayNodeRenderer';
import { FilterNodeRenderer } from './nodes/FilterNodeRenderer';
import { TriggerNodeRenderer } from './nodes/TriggerNodeRenderer';
import { WebhookNodeRenderer } from './nodes/WebhookNodeRenderer';
import type { RunStatus } from './runStatus';

// React Flow canvas — PR 8 adds selection emission + an imperative API for
// the settings drawer to mutate the selected node's data. PR 6 shipped the
// empty canvas; PR 7 added the palette + drag-drop + connection validation.

export type FlowNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
};

export interface CanvasGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Starting point — engine begins walking from this id. */
  triggerNodeId: string;
}

const nodeTypes = {
  trigger: TriggerNodeRenderer,
  action: ActionNodeRenderer,
  condition: ConditionNodeRenderer,
  branch: BranchNodeRenderer,
  filter: FilterNodeRenderer,
  delay: DelayNodeRenderer,
  webhook: WebhookNodeRenderer,
  ai: AiNodeRenderer,
};

// Single custom edge type. PR 9 introduces it; the engine doesn't care what
// `type` an edge has since persistence strips it, so existing workflow_json
// rows without a `type` still load fine — React Flow falls back to the
// default-edge prop when a saved edge lacks a type.
const edgeTypes = {
  workflow: WorkflowEdge,
};

const defaultEdgeOptions = {
  type: 'workflow',
} as const;

interface WorkflowCanvasProps {
  initialGraph: CanvasGraph;
  /** When true, drag/select/delete/connect are disabled. */
  readOnly?: boolean;
  /** Fires on every node/edge change with the full updated graph. */
  onChange: (graph: CanvasGraph) => void;
  /** Fires when the selected node changes (single-select). */
  onSelectionChange?: (nodeId: string | null) => void;
  /**
   * Run-status overlay for nodes — keyed by node.id. Merged into each
   * node's `data.runStatus` at render time without touching the canonical
   * state, so saving the workflow never persists ephemeral run state.
   * PR 9 adds the prop; PR 10's test mode populates it.
   */
  nodeRunStatuses?: Readonly<Record<string, RunStatus>>;
  /** Run-status overlay for edges — keyed by edge.id. Same semantics. */
  edgeRunStatuses?: Readonly<Record<string, RunStatus>>;
}

export interface WorkflowCanvasHandle {
  /**
   * Replace a node's `data` from outside the canvas (used by the settings
   * drawer). Triggers the normal onChange path so the shell's graph stays
   * authoritative.
   */
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}

function newNodeId(nodeType: PaletteNodeType): string {
  return `${nodeType}-${crypto.randomUUID().slice(0, 8)}`;
}

function newEdgeId(source: string, target: string): string {
  return `e-${source}-${target}-${crypto.randomUUID().slice(0, 6)}`;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas(
    {
      initialGraph,
      readOnly,
      onChange,
      onSelectionChange,
      nodeRunStatuses,
      edgeRunStatuses,
    },
    ref,
  ) {
    const [nodes, setNodes] = useState<Node[]>(() =>
      initialGraph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
    );
    const [edges, setEdges] = useState<Edge[]>(() =>
      initialGraph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        label: e.label,
        // Stamp the custom edge type at load. defaultEdgeOptions only applies
        // to newly-created edges via React Flow's connect handler; loaded
        // edges keep whatever type was saved. workflow_json doesn't persist
        // `type` (emitChange strips it as UI metadata), so reloads pick it
        // up fresh from this initializer.
        type: 'workflow',
      })),
    );

    const triggerNodeIdRef = useRef(initialGraph.triggerNodeId);
    const onChangeRef = useRef(onChange);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);
    useEffect(() => {
      nodesRef.current = nodes;
    }, [nodes]);
    useEffect(() => {
      edgesRef.current = edges;
    }, [edges]);

    const emitChange = useCallback((nextNodes: Node[], nextEdges: Edge[]) => {
      onChangeRef.current({
        nodes: nextNodes.map((n) => ({
          id: n.id,
          type: typeof n.type === 'string' ? n.type : 'trigger',
          position: { x: n.position.x, y: n.position.y },
          data: (n.data ?? {}) as Record<string, unknown>,
        })),
        edges: nextEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
          ...(typeof e.label === 'string' ? { label: e.label } : {}),
        })),
        triggerNodeId: triggerNodeIdRef.current,
      });
    }, []);

    const onNodesChange = useCallback(
      (changes: NodeChange[]) => {
        setNodes((current) => {
          const next = applyNodeChanges(changes, current);
          emitChange(next, edgesRef.current);
          return next;
        });
      },
      [emitChange],
    );

    const onEdgesChange = useCallback(
      (changes: EdgeChange[]) => {
        setEdges((current) => {
          const next = applyEdgeChanges(changes, current);
          emitChange(nodesRef.current, next);
          return next;
        });
      },
      [emitChange],
    );

    const isValidConnection = useCallback<IsValidConnection>(
      (connection) => {
        if (!connection.source || !connection.target) return false;
        const res = validateConnection({
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          existingEdges: edgesRef.current.map((e) => ({
            source: e.source,
            sourceHandle: e.sourceHandle,
          })),
          triggerNodeId: triggerNodeIdRef.current,
        });
        return res.ok;
      },
      [],
    );

    const onConnect = useCallback(
      (connection: Connection) => {
        if (!connection.source || !connection.target) return;
        const res = validateConnection({
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          existingEdges: edgesRef.current.map((e) => ({
            source: e.source,
            sourceHandle: e.sourceHandle,
          })),
          triggerNodeId: triggerNodeIdRef.current,
        });
        if (!res.ok) return;
        const id = newEdgeId(connection.source, connection.target);
        setEdges((current) => {
          const next = addEdge(
            { ...connection, id, type: 'workflow' },
            current,
          );
          emitChange(nodesRef.current, next);
          return next;
        });
      },
      [emitChange],
    );

    const onDragOver = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        if (readOnly) return;
        if (!e.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      },
      [readOnly],
    );

    const onDrop = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        if (readOnly) return;
        const itemId = e.dataTransfer.getData(PALETTE_DRAG_MIME);
        if (!itemId) return;
        const instance = reactFlowInstanceRef.current;
        if (!instance) return;
        const item = findPaletteItem(itemId);
        if (!item || item.disabled) return;
        e.preventDefault();

        const position = instance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        const id = newNodeId(item.nodeType);
        const newNode: Node = {
          id,
          type: item.nodeType,
          position,
          data: { ...item.defaultData },
        };
        setNodes((current) => {
          const next = [...current, newNode];
          emitChange(next, edgesRef.current);
          return next;
        });
      },
      [emitChange, readOnly],
    );

    // Selection. React Flow fires onSelectionChange with the full selected
    // set; we treat as single-select (the first selected node wins) and
    // emit `null` when the selection is empty.
    const handleSelectionChange = useCallback(
      ({ nodes: selectedNodes }: { nodes: Node[] }) => {
        const first = selectedNodes[0];
        onSelectionChangeRef.current?.(first?.id ?? null);
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        updateNodeData: (nodeId, data) => {
          setNodes((current) => {
            let mutated = false;
            const next = current.map((n) => {
              if (n.id !== nodeId) return n;
              mutated = true;
              return { ...n, data };
            });
            if (!mutated) return current;
            emitChange(next, edgesRef.current);
            return next;
          });
        },
      }),
      [emitChange],
    );

    // Render-time overlays. The status maps are merged into each node /
    // edge's `data.runStatus` here, never into the source-of-truth state,
    // so toggling test-mode statuses never dirties the workflow or
    // persists ephemeral run state to workflow_json.
    const renderedNodes = useMemo(() => {
      if (!nodeRunStatuses || Object.keys(nodeRunStatuses).length === 0) {
        return nodes;
      }
      return nodes.map((n) => {
        const status = nodeRunStatuses[n.id];
        if (!status) return n;
        return { ...n, data: { ...(n.data ?? {}), runStatus: status } };
      });
    }, [nodes, nodeRunStatuses]);

    const renderedEdges = useMemo(() => {
      if (!edgeRunStatuses || Object.keys(edgeRunStatuses).length === 0) {
        return edges;
      }
      return edges.map((e) => {
        const status = edgeRunStatuses[e.id];
        if (!status) return e;
        return { ...e, data: { ...(e.data ?? {}), runStatus: status } };
      });
    }, [edges, edgeRunStatuses]);

    return (
      <div
        ref={wrapperRef}
        className="h-full w-full"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onSelectionChange={handleSelectionChange}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    );
  },
);
