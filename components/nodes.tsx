"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PieceData } from "@/lib/types";

// Acento por barra esquerda 3px. Paleta por tipo é decisão do projeto (tokens em tailwind.config.ts).
const BAR: Record<string, string> = {
  input: "bg-yellow-500", worker: "bg-blue-500", supervisor: "bg-red-500", output: "bg-green-500",
};

export const PieceNodeView = memo(function PieceNodeView({ data, selected, type }: NodeProps) {
  const d = data as unknown as PieceData;
  const short = String(d.systemPrompt || "Sem prompt").slice(0, 72);
  return (
    <div className={`w-58 bg-surface rounded-xl border shadow-micro overflow-hidden flex ${selected ? "border-primary" : "border-hairline"}`} style={{ width: 232 }}>
      <div className={`w-[3px] shrink-0 ${BAR[String(type)] ?? "bg-muted"}`} />
      <div className="p-3 flex-1">
        <p className="text-[13px] font-semibold text-ink tracking-tightest truncate">{String(d.label)}</p>
        <p className="text-[11px] uppercase text-muted font-medium">{String(type)}</p>
        <p className="text-[12px] text-ink-2 mt-1 line-clamp-2 leading-5">{short}</p>
        {String(type) === "supervisor" && (
          <p className="text-[11px] text-red-500 mt-1 font-medium">max {Number(d.maxRetries ?? 5)} rodadas</p>
        )}
      </div>
      {String(type) !== "input" && <Handle type="target" position={Position.Left} />}
      {String(type) === "supervisor" ? (
        <>
          <Handle type="source" position={Position.Right} id="ok" style={{ top: "32%", backgroundColor: "#22c55e" }} />
          <Handle type="source" position={Position.Right} id="loop" style={{ top: "68%", backgroundColor: "#ef4444" }} />
        </>
      ) : (
        String(type) !== "output" && <Handle type="source" position={Position.Right} id="ok" />
      )}
    </div>
  );
});
