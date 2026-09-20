"use client";
import type { Edge } from "@xyflow/react";
import type { PieceKind, PieceNode } from "@/lib/types";
import { KIND_LABEL } from "@/lib/types";

const PRESETS = ["Resultado WOW", "Sem erros", "Tão bom quanto a referência", "Passa nos testes"];

export default function RightPanel({ node, edges, nodes, onPatch, onDelete, onFocusNode }: {
  node: PieceNode | null; edges: Edge[]; nodes: PieceNode[];
  onPatch: (id: string, patch: Partial<PieceNode["data"]>) => void; onDelete: (id: string) => void;
  onFocusNode: (id: string) => void;
}) {
  if (!node) return (
    <aside className="w-72 shrink-0 bg-surface border-l border-hairline p-4 text-[13px] text-muted">
      Selecione uma peça no canvas para editar nome, prompt e rodadas.
    </aside>
  );
  const d = node.data;
  const incoming = edges.filter((e) => e.target === node.id);
  const outgoing = edges.filter((e) => e.source === node.id);
  const nameOf = (id: string) => String(nodes.find((n) => n.id === id)?.data.label ?? id);
  return (
    <aside className="w-72 shrink-0 bg-surface border-l border-hairline p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted uppercase">{KIND_LABEL[node.type as PieceKind] ?? node.type}</p>
        <button onClick={() => onDelete(node.id)} className="text-[12px] text-danger border border-hairline rounded-md px-2 py-1 hover:bg-wash">Apagar</button>
      </div>
      <label className="block">
        <span className="text-[12px] font-medium text-ink">Nome da peça</span>
        <input value={String(d.label)} onChange={(e) => onPatch(node.id, { label: e.target.value })}
          className="mt-1 w-full text-[13px] border border-hairline rounded-md px-2 py-1.5 outline-none focus:border-primary text-ink" />
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-ink">System prompt</span>
        <textarea value={String(d.systemPrompt)} onChange={(e) => onPatch(node.id, { systemPrompt: e.target.value })} rows={6}
          className="mt-1 w-full text-[13px] border border-hairline rounded-md px-2 py-1.5 outline-none focus:border-primary text-ink-2 leading-5" />
      </label>
      {node.type === "supervisor" && (
        <>
          <div>
            <p className="text-[12px] font-medium text-ink mb-1.5">Preencher rápido</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => onPatch(node.id, { systemPrompt: `${d.systemPrompt}\nCritério: ${p}.` })}
                  className="text-[12px] border border-hairline rounded-md px-2 py-1 hover:bg-wash text-ink-2">{p}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-medium text-ink mb-1.5">Máximo de rodadas ({Number(d.maxRetries)})</p>
            <input type="range" min={3} max={10} value={Number(d.maxRetries ?? 5)}
              onChange={(e) => onPatch(node.id, { maxRetries: Number(e.target.value) })} className="w-full accent-[#0075de]" />
          </div>
          <label className="block">
            <span className="text-[12px] font-medium text-ink">Feedback do loop</span>
            <textarea value={String(d.feedback)} onChange={(e) => onPatch(node.id, { feedback: e.target.value })} rows={3}
              className="mt-1 w-full text-[13px] border border-hairline rounded-md px-2 py-1.5 outline-none focus:border-primary text-ink-2 leading-5" />
          </label>
        </>
      )}
      <div className="bg-canvas border border-hairline rounded-xl p-3 text-[12px] leading-5">
        <p className="font-semibold text-ink mb-1.5">Recebe de / devolve para</p>
        <p className="text-muted mb-1">Recebe:</p>
        {incoming.length === 0 && <p className="text-ink-2 mb-1">—</p>}
        <div className="flex flex-wrap gap-1 mb-2">
          {incoming.map((e) => (
            <button key={e.id} onClick={() => onFocusNode(e.source)} title="Centralizar nó"
              className="border border-hairline bg-surface rounded-md px-2 py-0.5 hover:border-primary hover:text-primary text-ink-2">
              {nameOf(e.source)}{e.label ? ` · ${e.label}` : ""}
            </button>
          ))}
        </div>
        <p className="text-muted mb-1">Devolve:</p>
        {outgoing.length === 0 && <p className="text-ink-2">—</p>}
        <div className="flex flex-wrap gap-1">
          {outgoing.map((e) => (
            <button key={e.id} onClick={() => onFocusNode(e.target)} title="Centralizar nó"
              className="border border-hairline bg-surface rounded-md px-2 py-0.5 hover:border-primary hover:text-primary text-ink-2">
              {nameOf(e.target)}{e.label ? ` · ${e.label}` : ""}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
