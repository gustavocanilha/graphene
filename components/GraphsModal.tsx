"use client";
import { useCallback, useEffect, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { PieceNode } from "@/lib/types";
import { deleteGraph, listGraphs, saveGraph } from "@/lib/persist";

/** Gerenciador de grafos salvos em ~/.graphene: abrir, salvar como, excluir e importar JSON. */
export default function GraphsModal({ graphName, title, nodes, edges, onOpen, onSaved, onClose, onImportFile }: {
  graphName: string; title: string; nodes: PieceNode[]; edges: Edge[];
  onOpen: (name: string) => void; onSaved: (name: string) => void; onClose: () => void;
  onImportFile: (f: File) => void;
}) {
  const [graphs, setGraphs] = useState<string[]>([]);
  const [name, setName] = useState(graphName);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGraphs(await listGraphs());
      setError(null);
    } catch {
      setError("Não foi possível listar os grafos. Confira se o servidor está no ar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    const n = name.trim() || "default";
    setBusy(true);
    try {
      await saveGraph({ name: n, title, nodes, edges });
      onSaved(n);
      await refresh();
    } catch {
      setError(`Falha ao salvar "${n}". Nada foi gravado.`);
    } finally {
      setBusy(false);
    }
  };

  const del = async (g: string) => {
    if (confirmDel !== g) {
      setConfirmDel(g);
      setTimeout(() => setConfirmDel(null), 3000);
      return;
    }
    setBusy(true);
    try {
      await deleteGraph(g);
      setConfirmDel(null);
      await refresh();
    } catch {
      setError(`Falha ao excluir "${g}".`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/20 grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Meus grafos"
        className="w-full max-w-md bg-surface rounded-xl border border-hairline shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <p className="font-semibold text-ink tracking-tightest text-[15px]">Meus grafos</p>
          <div className="flex-1" />
          <button onClick={onClose} className="text-[13px] border border-hairline rounded-md px-3 py-1.5 hover:bg-wash">Fechar</button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do grafo"
              aria-label="Nome do grafo" maxLength={120} autoFocus
              className="flex-1 text-[13px] border border-hairline rounded-md px-2 py-1.5 outline-none focus:border-primary text-ink" />
            <button onClick={save} disabled={busy}
              className="text-[13px] font-medium bg-primary hover:bg-primary-press text-white rounded-md px-4 py-1.5 disabled:opacity-60">Salvar</button>
          </div>
          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
          {loading && <p className="text-[13px] text-muted">Carregando…</p>}
          {!loading && graphs.length === 0 && <p className="text-[13px] text-muted">Nenhum grafo salvo ainda.</p>}
          <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {graphs.map((g) => (
              <li key={g} className="flex items-center gap-2 border border-hairline rounded-md px-2 py-1.5">
                <span className="text-[13px] font-medium text-ink truncate flex-1">{g}</span>
                {g === graphName && <span className="text-[11px] text-muted">atual</span>}
                <button onClick={() => onOpen(g)} disabled={busy} className="text-[12px] border border-hairline rounded px-2 py-0.5 hover:bg-wash disabled:opacity-60">Abrir</button>
                <button onClick={() => del(g)} disabled={busy}
                  className={`text-[12px] border rounded px-2 py-0.5 disabled:opacity-60 ${confirmDel === g ? "bg-danger text-white border-danger" : "border-hairline hover:bg-wash text-danger"}`}>
                  {confirmDel === g ? "Certeza?" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">Arquivos `.graphene` em `~/.graphene/`.</p>
          <label className="text-[13px] text-center border border-hairline rounded-md px-3 py-1.5 cursor-pointer hover:bg-wash text-ink-2">
            Abrir arquivo JSON
            <input type="file" accept=".json,.graphene" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onImportFile(e.target.files[0]); onClose(); }} />
          </label>
        </div>
      </div>
    </div>
  );
}
