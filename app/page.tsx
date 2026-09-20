"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Edge, type OnConnect, type OnConnectEnd, type OnConnectStart,
} from "@xyflow/react";
import Topbar from "@/components/Topbar";
import LeftSidebar from "@/components/LeftSidebar";
import GraphCanvas from "@/components/GraphCanvas";
import RightPanel from "@/components/RightPanel";
import ValidationBar from "@/components/ValidationBar";
import ExportModal from "@/components/ExportModal";
import GraphsModal from "@/components/GraphsModal";
import { autoLayout } from "@/lib/layout";
import { KIND_LABEL, defaultData, nextLabel, uid, type PieceKind, type PieceNode } from "@/lib/types";
import { toHermesSkill, toJsonPayload, toMarkdown, toPython } from "@/lib/export";
import { hasErrors, validateGraph } from "@/lib/validate";
import { normalizeGraph } from "@/lib/graph";
import { graphSignature, listGraphs, loadGraph, saveGraph, type GraphPayload, type SaveState } from "@/lib/persist";

function demo(): PieceNode[] {
  const made: PieceNode[] = [];
  const mk = (kind: PieceKind, id: string, x: number): PieceNode => {
    const n = { id, type: kind, position: { x, y: 80 }, data: defaultData(kind, made) } as PieceNode;
    made.push(n);
    return n;
  };
  return [mk("input", "input_1", 0), mk("worker", "worker_1", 300), mk("supervisor", "sup_1", 600), mk("output", "out_1", 900)];
}
const demoEdges: Edge[] = [
  { id: "e1", source: "input_1", target: "worker_1", type: "bezier", label: "aprovado" },
  { id: "e2", source: "worker_1", target: "sup_1", type: "bezier", label: "revisão" },
  { id: "e3", source: "sup_1", target: "out_1", type: "bezier", label: "aprovado" },
  { id: "e4", source: "sup_1", sourceHandle: "loop", target: "worker_1", type: "bezier", label: "reprovado/feedback" },
];

const clock = (): string => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Nome de arquivo seguro para o grafo (mesma regra da API).
const slugFile = (t: string): string => t.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "default";

function Editor() {
  const [nodes, setNodes, onNodesChange] = useNodesState<PieceNode>(demo());
  const [edges, setEdges, onEdgesChange] = useEdgesState(demoEdges);
  const [title, setTitle] = useState("Meu grafo");
  const [graphName, setGraphName] = useState("default");
  const [showExport, setShowExport] = useState(false);
  const [showGraphs, setShowGraphs] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [zoomLabel, setZoomLabel] = useState("100%");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);
  const lastSig = useRef("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ fromNode: string; fromHandle: string | null; fromType: string } | null>(null);
  const [connectMenu, setConnectMenu] = useState<{ x: number; y: number; flow: { x: number; y: number }; fromNode: string; fromHandle: string | null; fromType: string } | null>(null);
  const rf = useReactFlow();

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const payload = useMemo<GraphPayload>(() => ({ name: graphName, title, nodes, edges }), [graphName, title, nodes, edges]);
  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);
  const selected = useMemo(() => nodes.find((n) => n.selected) ?? null, [nodes]);

  // Exportações só são montadas com a janela aberta: nenhum custo durante o arrasto de nós.
  const exported = useMemo(
    () => (showExport
      ? { python: toPython(nodes, edges), json: toJsonPayload(nodes, edges), markdown: toMarkdown(nodes, edges), hermes: toHermesSkill(nodes, edges, title) }
      : null),
    [showExport, nodes, edges, title],
  );

  // Persistência única: grava em ~/.graphene, guarda cache local e reflete o estado na Topbar.
  const persist = useCallback(async (p: GraphPayload, silent: boolean): Promise<boolean> => {
    setSaveState({ kind: "saving" });
    try { localStorage.setItem("graphene:default", JSON.stringify(p)); } catch { /* quota cheia: o arquivo em ~/.graphene ainda será gravado */ }
    try {
      await saveGraph(p);
      lastSig.current = graphSignature(p);
      setSaveState({ kind: "saved", at: clock() });
      if (!silent) flash(`Grafo "${p.name}" salvo.`);
      return true;
    } catch {
      setSaveState({ kind: "error" });
      if (!silent) flash("Erro ao salvar. Tente de novo.");
      return false;
    }
  }, [flash]);

  const saveNow = useCallback(async (): Promise<void> => { await persist(payload, false); }, [persist, payload]);
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;

  // Carga inicial: API ~/.graphene -> localStorage -> demo.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      const remote = await loadGraph("default");
      if (remote?.nodes?.length) {
        const { nodes: rn, edges: re } = normalizeGraph(remote);
        if (rn.length) {
          const t = remote.title ?? "Meu grafo";
          setNodes(rn); setEdges(re); setTitle(t); setGraphName(remote.name ?? "default");
          lastSig.current = graphSignature({ name: remote.name ?? "default", title: t, nodes: rn, edges: re });
          return;
        }
      }
      try {
        const raw = localStorage.getItem("graphene:default");
        if (!raw) return;
        const local = JSON.parse(raw) as Partial<GraphPayload>;
        if (!local.nodes?.length) return;
        const { nodes: ln, edges: le } = normalizeGraph(local);
        if (!ln.length) return;
        const t = local.title ?? "Meu grafo";
        setNodes(ln); setEdges(le); setTitle(t);
        lastSig.current = graphSignature({ name: local.name ?? "default", title: t, nodes: ln, edges: le });
      } catch { /* cache local vazio ou corrompido */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: nada durante o arrasto; a assinatura só é calculada quando o grafo assenta.
  useEffect(() => {
    if (!loaded.current) return;
    if (nodes.some((n) => n.dragging)) return;
    const t = setTimeout(() => {
      if (graphSignature(payload) === lastSig.current) return;
      void persist(payload, true);
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, payload, persist]);

  const openGraph = useCallback(async (name: string) => {
    setShowGraphs(false);
    const d = await loadGraph(name);
    if (!d?.nodes) { flash(`Grafo "${name}" não encontrado.`); return; }
    const { nodes: dn, edges: de } = normalizeGraph(d);
    if (!dn.length) { flash(`Grafo "${name}" está vazio ou corrompido.`); return; }
    const t = d.title ?? name;
    setNodes(dn); setEdges(de); setTitle(t); setGraphName(d.name ?? name);
    lastSig.current = graphSignature({ name: d.name ?? name, title: t, nodes: dn, edges: de });
  }, [flash, setEdges, setNodes]);

  const importFile = useCallback((f: File) => {
    f.text().then((raw) => {
      let d: unknown;
      try { d = JSON.parse(raw); } catch { flash("JSON inválido."); return; }
      const obj = (d ?? {}) as { nodes?: unknown; edges?: unknown; graph?: { nodes?: unknown; edges?: unknown } };
      const source = obj.graph && Array.isArray(obj.graph.nodes) ? obj.graph : obj;
      const { nodes: ns, edges: es } = normalizeGraph(source);
      if (!ns.length) { flash("Arquivo vazio ou sem peças válidas."); return; }
      const found = validateGraph(ns, es);
      if (hasErrors(found)) { flash(`Arquivo inválido: ${found.find((i) => i.level === "error")?.text ?? "rejeitado"}`); return; }
      setNodes(ns); setEdges(es); flash("Arquivo importado.");
    }).catch(() => flash("JSON inválido."));
  }, [flash, setNodes, setEdges]);

  const newGraph = useCallback(async () => {
    await saveNow();
    let base = "Meu grafo";
    try {
      const taken = new Set(await listGraphs());
      let i = 2;
      while (taken.has(slugFile(base))) base = `Meu grafo ${i++}`;
    } catch { /* segue com o nome base */ }
    const g = slugFile(base);
    try {
      await saveGraph({ name: g, title: base, nodes: [], edges: [] });
      lastSig.current = graphSignature({ name: g, title: base, nodes: [], edges: [] });
      setNodes([]); setEdges([]); setTitle(base); setGraphName(g);
      setSaveState({ kind: "saved", at: clock() });
      flash(`Novo grafo "${g}" criado.`);
    } catch {
      setSaveState({ kind: "error" });
      flash("Erro ao criar grafo.");
    }
  }, [flash, saveNow, setNodes, setEdges]);

  const addPiece = useCallback((kind: PieceKind) => {
    const id = uid(kind.slice(0, 4));
    setNodes((ns) => [...ns, {
      id, type: kind, position: { x: 120 + ns.length * 40, y: 160 + ns.length * 24 },
      data: defaultData(kind, ns), selected: true,
    } as PieceNode]);
  }, [setNodes]);

  const onConnect: OnConnect = useCallback((c) => {
    const loop = c.sourceHandle === "loop";
    setEdges((es) => [...es, {
      id: uid("e"), source: c.source, target: c.target,
      sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined,
      type: "bezier", label: loop ? "reprovado/feedback" : "aprovado",
    }]);
  }, [setEdges]);

  const onConnectStart: OnConnectStart = useCallback((_e, p) => {
    pending.current = p.nodeId ? { fromNode: p.nodeId, fromHandle: p.handleId, fromType: p.handleType ?? "source" } : null;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((e, s) => {
    const p = pending.current;
    pending.current = null;
    if (!p || s?.toNode) return;
    const me = e as MouseEvent & { changedTouches?: { clientX: number; clientY: number }[] };
    const cx = me.clientX ?? me.changedTouches?.[0]?.clientX ?? 0;
    const cy = me.clientY ?? me.changedTouches?.[0]?.clientY ?? 0;
    const rect = wrapRef.current?.getBoundingClientRect();
    setConnectMenu({
      x: Math.max(8, Math.min(cx - (rect?.left ?? 0), (rect?.width ?? 400) - 224)),
      y: Math.max(8, cy - (rect?.top ?? 0)),
      flow: rf.screenToFlowPosition({ x: cx, y: cy }),
      ...p,
    });
  }, [rf]);

  const createFromMenu = (kind: PieceKind) => {
    if (!connectMenu) return;
    const m = connectMenu;
    const id = uid(kind.slice(0, 4));
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), {
      id, type: kind, position: m.flow, data: defaultData(kind, ns), selected: true,
    } as PieceNode]);
    const loop = m.fromHandle === "loop";
    setEdges((es) => [...es, m.fromType === "source"
      ? { id: uid("e"), source: m.fromNode, sourceHandle: m.fromHandle ?? undefined, target: id, type: "bezier", label: loop ? "reprovado/feedback" : "aprovado" }
      : { id: uid("e"), source: id, target: m.fromNode, type: "bezier", label: "aprovado" }]);
    setConnectMenu(null);
  };

  const patch = useCallback((id: string, p: Partial<PieceNode["data"]>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)));
  }, [setNodes]);

  const remove = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, [setNodes, setEdges]);

  const duplicateSelected = useCallback(() => {
    setNodes((ns) => {
      const sel = ns.find((n) => n.selected);
      if (!sel) return ns;
      const id = uid(sel.type!.slice(0, 4));
      return [...ns.map((n) => ({ ...n, selected: false })), {
        ...sel, id, position: { x: sel.position.x + 32, y: sel.position.y + 32 }, selected: true,
        data: { ...sel.data, label: nextLabel(sel.type as PieceKind, ns) },
      }];
    });
  }, [setNodes]);

  const focusNode = useCallback((id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    rf.fitView({ nodes: [{ id }], padding: 0.35, duration: 300 });
  }, [rf, setNodes]);

  const clearSelection = useCallback(() => {
    setConnectMenu(null);
    // Sem seleção ativa, devolve o mesmo array: evita render e autosave inúteis.
    setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => ({ ...n, selected: false })) : ns));
  }, [setNodes]);

  // Zoom no rodapé sem polling: o próprio canvas informa a viewport.
  const onViewportZoom = useCallback((zoom: number) => {
    const next = `${Math.round(zoom * 100)}%`;
    setZoomLabel((prev) => (prev === next ? prev : next));
  }, []);

  // Teclado: Esc fecha camadas, Ctrl+S salva, Ctrl+Shift+E exporta, Del apaga, setas movem, Ctrl+D duplica.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setConnectMenu(null); setShowExport(false); setShowGraphs(false); return; }
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); setShowExport(true); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setNodes((ns) => ns.filter((n) => !n.selected));
        setEdges((es) => es.filter((e) => !e.selected));
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 24 : 8;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        setNodes((ns) => ns.map((n) => (n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setNodes, setEdges, duplicateSelected]);

  return (
    <div className="h-screen flex flex-col">
      <Topbar graphTitle={title} status={saveState} onExport={() => setShowExport(true)}
        onClear={() => { setNodes([]); setEdges([]); }}
        onSave={saveNow} onManage={() => setShowGraphs(true)} onNew={newGraph} />
      <div className="flex-1 flex min-h-0">
        <LeftSidebar onAdd={addPiece} />
        <div ref={wrapRef} className="flex-1 relative flex min-w-0">
          <GraphCanvas nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onConnectStart={onConnectStart} onConnectEnd={onConnectEnd}
            onViewportZoom={onViewportZoom}
            onDropKind={(kind, pos) => {
              const id = uid(kind.slice(0, 4));
              setNodes((ns) => [...ns, {
                id, type: kind as PieceKind, position: rf.screenToFlowPosition({ x: pos.x + 240, y: pos.y + 56 }),
                data: defaultData(kind as PieceKind, ns),
              } as PieceNode]);
            }}
            onSelect={clearSelection} />
          {connectMenu && (
            <div className="absolute z-20 w-52 bg-surface border border-hairline rounded-xl shadow-pop p-1.5" style={{ left: connectMenu.x, top: connectMenu.y }}>
              <p className="text-[11px] font-semibold text-muted px-2 py-1">CRIAR PEÇA LIGADA</p>
              {(Object.keys(KIND_LABEL) as PieceKind[]).map((k) => (
                <button key={k} onClick={() => createFromMenu(k)} className="w-full text-left px-2 py-1.5 rounded-md hover:bg-wash text-[13px] font-medium text-ink">{KIND_LABEL[k]}</button>
              ))}
            </div>
          )}
          <ValidationBar issues={issues} zoom={zoomLabel}
            onFit={() => rf.fitView({ padding: 0.2 })}
            onArrange={() => setNodes((ns) => autoLayout(ns, edges) as PieceNode[])}
            onZoomIn={() => rf.zoomIn({ duration: 200 })} onZoomOut={() => rf.zoomOut({ duration: 200 })} />
        </div>
        <RightPanel node={selected} edges={edges} nodes={nodes} onPatch={patch} onDelete={remove} onFocusNode={focusNode} />
      </div>
      {showExport && exported && <ExportModal {...exported} onClose={() => setShowExport(false)} />}
      {showGraphs && <GraphsModal graphName={graphName} title={title} nodes={nodes} edges={edges}
        onOpen={openGraph} onSaved={(n) => { setGraphName(n); setTitle(n); }} onClose={() => setShowGraphs(false)} onImportFile={importFile} />}
      {toast && (
        <div role="status" aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-white text-[13px] font-medium rounded-full px-4 py-2 shadow-pop">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <ReactFlowProvider><Editor /></ReactFlowProvider>;
}
