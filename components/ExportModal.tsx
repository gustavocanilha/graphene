"use client";
import { useState } from "react";

const TABS = ["python", "json", "md", "hermes"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  python: "Python LangGraph", json: "Payload JSON", md: "Markdown", hermes: "Skill Hermes",
};
const TAB_FILE: Record<Tab, string> = {
  python: "grafo_langgraph.py", json: "grafo.json", md: "metaprompt.md", hermes: "hermes_skill.yaml",
};

/** Janela de exportação: quatro formatos, copiar e baixar. Esc fecha (tratado no editor). */
export default function ExportModal({ python, json, markdown, hermes, onClose }: {
  python: string; json: string; markdown: string; hermes: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("python");
  const [copyLabel, setCopyLabel] = useState("Copiar");
  const cur = { python, json, md: markdown, hermes }[tab];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cur);
      setCopyLabel("Copiado!");
    } catch {
      setCopyLabel("Falha ao copiar");
    }
    setTimeout(() => setCopyLabel("Copiar"), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/20 grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Exportar grafo"
        className="w-full max-w-3xl bg-surface rounded-xl border border-hairline shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[13px] px-3 py-1.5 rounded-md ${tab === t ? "bg-primary text-white" : "border border-hairline text-ink-2 hover:bg-wash"}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={copy} className="text-[13px] border border-hairline rounded-md px-3 py-1.5 hover:bg-wash">{copyLabel}</button>
          <button onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([cur], { type: "text/plain" }));
            a.download = TAB_FILE[tab];
            a.click();
            URL.revokeObjectURL(a.href);
          }} className="text-[13px] border border-hairline rounded-md px-3 py-1.5 hover:bg-wash">Baixar</button>
          <button onClick={onClose} className="text-[13px] border border-hairline rounded-md px-3 py-1.5 hover:bg-wash">Fechar</button>
        </div>
        <pre className="p-4 text-[12px] font-mono leading-5 text-ink-2 overflow-auto max-h-[60vh] whitespace-pre-wrap">{cur}</pre>
      </div>
    </div>
  );
}
