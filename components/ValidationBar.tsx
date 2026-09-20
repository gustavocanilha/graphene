"use client";
import { countIssues, type Issue } from "@/lib/validate";

export default function ValidationBar({ issues, zoom, onFit, onArrange, onZoomIn, onZoomOut }: {
  issues: Issue[]; zoom: string; onFit: () => void; onArrange: () => void; onZoomIn: () => void; onZoomOut: () => void;
}) {
  const counts = countIssues(issues);
  return (
    <>
      <div className="absolute left-3 bottom-3 flex items-center gap-1.5 bg-surface border border-hairline rounded-md px-2 py-1.5 shadow-micro text-[12px] text-ink-2">
        <button onClick={onZoomIn} aria-label="Aproximar" className="border border-hairline rounded px-2 py-0.5 hover:bg-wash font-medium">+</button>
        <button onClick={onZoomOut} aria-label="Afastar" className="border border-hairline rounded px-2 py-0.5 hover:bg-wash font-medium">−</button>
        <span className="px-1 font-medium">{zoom}</span>
        <button onClick={onFit} className="border border-hairline rounded px-2 py-0.5 hover:bg-wash">Enquadrar</button>
        <button onClick={onArrange} className="border border-hairline rounded px-2 py-0.5 hover:bg-wash">Arrumar</button>
      </div>
      <div className="absolute right-3 bottom-3 w-80 bg-surface border border-hairline rounded-xl p-3 shadow-micro">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[11px] font-semibold text-muted">ANTES DE EXPORTAR</p>
          <div className="flex-1" />
          {issues.length > 0 && (
            <span className="text-[11px] font-medium text-muted">
              {counts.errors > 0 && <span className="text-danger">{counts.errors} erro{counts.errors > 1 ? "s" : ""}</span>}
              {counts.errors > 0 && counts.warns > 0 && " · "}
              {counts.warns > 0 && <span className="text-warn">{counts.warns} aviso{counts.warns > 1 ? "s" : ""}</span>}
            </span>
          )}
        </div>
        {issues.length === 0
          ? <p className="text-[13px] text-ok-text font-medium">Grafo válido. Pode exportar.</p>
          : <ul className="text-[12px] leading-5 space-y-1">
              {issues.map((i, k) => (
                <li key={k} className={i.level === "error" ? "text-danger" : "text-warn"}>• {i.text}</li>
              ))}
            </ul>}
      </div>
    </>
  );
}
