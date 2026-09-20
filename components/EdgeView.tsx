"use client";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { edgeStyle, edgeTone } from "@/lib/edges";

export default function EdgeView(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, sourceHandleId, selected } = props;
  // Rótulo em pill vale para toda aresta; a cor só nas que saem do supervisor.
  const sourceNode = useInternalNode(props.source);
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const style = edgeStyle(edgeTone(label, sourceHandleId), sourceNode?.type === "supervisor");
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: style.stroke, strokeWidth: selected ? 3 : 2, strokeLinecap: "round" }} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap pointer-events-none"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, color: style.text, borderColor: style.border }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
