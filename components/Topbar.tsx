"use client";
import { useState } from "react";
import Image from "next/image";
import type { SaveState } from "@/lib/persist";

/** Barra superior: título, estado do autosave, ações do grafo e exportação. */
export default function Topbar({ graphTitle, status, onClear, onExport, onSave, onManage, onNew }: {
  graphTitle: string; status: SaveState;
  onClear: () => void; onExport: () => void;
  onSave: () => Promise<void>; onManage: () => void; onNew: () => void;
}) {
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  const statusText =
    status.kind === "saving" ? "Salvando…"
      : status.kind === "saved" ? `Salvo ${status.at ?? ""}`.trim()
        : status.kind === "error" ? "Falha ao salvar"
          : "";

  const save = async () => {
    setBusy(true);
    try { await onSave(); } finally { setBusy(false); }
  };

  return (
    <header className="relative h-14 shrink-0 flex items-center gap-2 px-4 bg-surface border-b border-hairline">
      <Image src="/logo.svg" alt="Graphene" width={28} height={28} unoptimized className="w-7 h-7 rounded-full" priority />
      <span className="font-semibold text-ink tracking-tightest text-[15px]">Graphene</span>
      <p className="absolute left-1/2 -translate-x-1/2 max-w-md truncate text-[13px] text-muted" title={graphTitle}>{graphTitle}</p>
      <div className="flex-1" />
      <span role="status" aria-live="polite"
        className={`text-[12px] font-medium ${status.kind === "error" ? "text-danger" : "text-muted"}`}>
        {statusText}
      </span>
      <button onClick={onManage} className="text-[13px] bg-surface border border-hairline rounded-md px-3 py-1.5 hover:bg-wash text-ink-2">Meus grafos</button>
      <button onClick={onNew} className="text-[13px] bg-surface border border-hairline rounded-md px-3 py-1.5 hover:bg-wash text-ink-2">Novo</button>
      <button
        onClick={() => {
          if (!arming) {
            setArming(true);
            setTimeout(() => setArming(false), 3000);
            return;
          }
          setArming(false);
          onClear();
        }}
        onBlur={() => setArming(false)}
        title="Remove todas as peças do canvas"
        className={`text-[13px] border rounded-md px-3 py-1.5 ${arming ? "bg-danger text-white border-danger" : "bg-surface border-hairline hover:bg-wash text-ink-2"}`}>
        {arming ? "Tem certeza?" : "Limpar"}
      </button>
      <button onClick={save} disabled={busy} title="Salvar (Ctrl+S)"
        className="text-[13px] bg-surface border border-hairline rounded-md px-3 py-1.5 hover:bg-wash text-ink-2 disabled:opacity-60">
        Salvar
      </button>
      <button onClick={onExport} title="Exportar para a IA (Ctrl+Shift+E)"
        className="text-[13px] font-medium bg-primary hover:bg-primary-press text-white rounded-md px-4 py-1.5">Exportar para a IA</button>
    </header>
  );
}
