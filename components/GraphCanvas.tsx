"use client";
import { useCallback } from "react";
import {
  Background, BackgroundVariant, ConnectionLineType, ReactFlow,
  type Edge, type EdgeTypes, type NodeTypes,
  type OnConnect, type OnConnectEnd, type OnConnectStart, type OnEdgesChange, type OnNodesChange, type Viewport,
} from "@xyflow/react";
import { PieceNodeView } from "./nodes";
import EdgeView from "./EdgeView";
import type { PieceNode } from "@/lib/types";

const nodeTypes: NodeTypes = { input: PieceNodeView, worker: PieceNodeView, supervisor: PieceNodeView, output: PieceNodeView };
const edgeTypes: EdgeTypes = { bezier: EdgeView };

/** Canvas ReactFlow. Repassa eventos com os tipos reais — sem casts de fuga. */
export default function GraphCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onConnectStart, onConnectEnd, onViewportZoom, onDropKind, onSelect }: {
  nodes: PieceNode[]; edges: Edge[];
  onNodesChange: OnNodesChange<PieceNode>; onEdgesChange: OnEdgesChange;
  onConnect: OnConnect; onConnectStart: OnConnectStart; onConnectEnd: OnConnectEnd;
  onViewportZoom: (zoom: number) => void;
  onDropKind: (kind: string, pos: { x: number; y: number }) => void;
  onSelect: () => void;
}) {
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  return (
    <div className="flex-1 relative bg-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
        onDragOver={onDragOver}
        onDrop={(e) => {
          e.preventDefault();
          const kind = e.dataTransfer.getData("graphene-kind");
          if (!kind) return;
          const r = (e.target as HTMLElement).getBoundingClientRect();
          onDropKind(kind, { x: e.clientX - r.left, y: e.clientY - r.top });
        }}
        onPaneClick={onSelect}
        onMove={(_e: unknown, vp: Viewport) => onViewportZoom(vp.zoom)}
        fitView colorMode="light" defaultEdgeOptions={{ type: "bezier" }}
        connectionLineType={ConnectionLineType.Bezier}
        proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Lines} gap={20} color="#e6e6e6" />
      </ReactFlow>
    </div>
  );
}
