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
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';

import { validateConnection } from './connectionValidation';
import {
  PALETTE_DRAG_MIME,
  findPaletteItem,
  type PaletteNodeType,
} from './paletteCatalog';
import { ActionNodeRenderer } from './nodes/ActionNodeRenderer';
import { AiNodeRenderer } from './nodes/AiNodeRenderer';
import { BranchNodeRenderer } from './nodes/BranchNodeRenderer';
import { ConditionNodeRenderer } from './nodes/ConditionNodeRenderer';
import { DelayNodeRenderer } from './nodes/DelayNodeRenderer';
import { FilterNodeRenderer } from './nodes/FilterNodeRenderer';
import { TriggerNodeRenderer } from './nodes/TriggerNodeRenderer';
import { WebhookNodeRenderer } from './nodes/WebhookNodeRenderer';

// React Flow canvas — PR 7 adds the palette drop target + connection
// validation. PR 6 left this as an empty canvas with pan/zoom/minimap.
// PR 8 wires the right-sidebar settings drawer for per-node config.

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

interface WorkflowCanvasProps {
  initialGraph: CanvasGraph;
  /** When true, drag/select/delete/connect are disabled. */
  readOnly?: boolean;
  /** Fires on every node/edge change with the full updated graph. */
  onChange: (graph: CanvasGraph) => void;
}

// Browser-side id generator. crypto.randomUUID is available in all evergreen
// browsers; the workflow editor only runs client-side so we don't need a
// fallback path.
function newNodeId(nodeType: PaletteNodeType): string {
  return `${nodeType}-${crypto.randomUUID().slice(0, 8)}`;
}

function newEdgeId(source: string, target: string): string {
  return `e-${source}-${target}-${crypto.randomUUID().slice(0, 6)}`;
}

export function WorkflowCanvas({
  initialGraph,
  readOnly,
  onChange,
}: WorkflowCanvasProps) {
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
    })),
  );

  // Refs let the change handlers reach the latest counterpart-array + the
  // latest onChange callback without resubscribing on every state tick.
  const triggerNodeIdRef = useRef(initialGraph.triggerNodeId);
  const onChangeRef = useRef(onChange);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
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

  // Pre-flight validation while the user drags a connection. React Flow
  // calls this for every potential target on mouseover; returning false
  // prevents the visual completion of a forbidden link.
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
        const next = addEdge({ ...connection, id }, current);
        emitChange(nodesRef.current, next);
        return next;
      });
    },
    [emitChange],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [readOnly]);

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

  return (
    <div ref={wrapperRef} className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          reactFlowInstanceRef.current = instance;
        }}
        nodeTypes={nodeTypes}
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
}
