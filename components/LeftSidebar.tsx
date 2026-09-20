"use client";
import { useState } from "react";
import type { PieceKind } from "@/lib/types";
import { KIND_LABEL } from "@/lib/types";

function Icon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className ?? "w-5 h-5"} aria-hidden>
      {children}
    </svg>
  );
}

// Cores dos ícones iguais às barras dos nós (tokens em tailwind.config.ts).
const PIECES: { kind: PieceKind; desc: string; color: string; icon: React.ReactNode }[] = [
  { kind: "input", desc: "Prompt inicial", color: "text-yellow-500", icon: <><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M5 21h14" /></> },
  { kind: "worker", desc: "Executa tarefa", color: "text-blue-500", icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { kind: "supervisor", desc: "Avalia e roteia", color: "text-red-500", icon: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></> },
  { kind: "output", desc: "Consolida final", color: "text-green-500", icon: <><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M5 21h14" /></> },
];

export default function LeftSidebar({ onAdd }: { onAdd: (k: PieceKind) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className={`${open ? "w-60" : "w-[80px]"} shrink-0 bg-surface border-r border-hairline p-3 flex flex-col gap-3 overflow-y-auto transition-all`}>
      <div className={`flex items-center ${open ? "justify-between" : "justify-center"}`}>
        {open && <p className="text-[11px] font-semibold tracking-wide text-muted">PEÇAS</p>}
        <button onClick={() => setOpen((v) => !v)} title={open ? "Colapsar" : "Expandir"}
          aria-label={open ? "Colapsar barra de peças" : "Expandir barra de peças"}
          className="border border-hairline rounded-md p-1.5 hover:bg-wash text-ink-2">
          <Icon className="w-4 h-4"><path d={open ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} /></Icon>
        </button>
      </div>
      <div className={`flex flex-col gap-2 border border-hairline rounded-xl p-2 bg-canvas ${open ? "" : "items-center"}`}>
        {PIECES.map((p) => (
          <button key={p.kind} draggable title={open ? undefined : KIND_LABEL[p.kind]}
            onDragStart={(e) => e.dataTransfer.setData("graphene-kind", p.kind)}
            onClick={() => onAdd(p.kind)}
            className={`bg-surface border border-hairline rounded-xl shadow-micro hover:border-primary cursor-grab ${open ? "text-left p-3" : "w-9 h-9 grid place-items-center"}`}>
            <span className={`flex items-center gap-2 text-[13px] font-semibold text-ink ${open ? "" : "justify-center"}`}>
              <Icon className={`w-5 h-5 shrink-0 ${p.color}`}>{p.icon}</Icon>
              {open && KIND_LABEL[p.kind]}
            </span>
            {open && <span className="text-[12px] text-muted">{p.desc}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}
