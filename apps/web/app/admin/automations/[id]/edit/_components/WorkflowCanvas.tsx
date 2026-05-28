'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TriggerNodeRenderer } from './nodes/TriggerNodeRenderer';

// React Flow canvas — PR 6 ships an empty canvas with pan/zoom/minimap.
// No palette, no settings drawer, no test mode. Adding/configuring nodes
// comes in PRs 7-10.

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
  /** Starting point — engine begins walking from this id. PR 6 keeps it stable. */
  triggerNodeId: string;
}

// Custom node type registry. PR 7+ adds the rest.
const nodeTypes = {
  trigger: TriggerNodeRenderer,
};

interface WorkflowCanvasProps {
  initialGraph: CanvasGraph;
  /** When true, drag/select/delete are disabled (used for archived workflows). */
  readOnly?: boolean;
  /** Fires on every node/edge change with the full updated graph. */
  onChange: (graph: CanvasGraph) => void;
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
  // React Flow batches changes per-frame; recreating handlers on every node
  // change cascades into reconciliation pressure.
  const triggerNodeIdRef = useRef(initialGraph.triggerNodeId);
  const onChangeRef = useRef(onChange);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
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

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
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
