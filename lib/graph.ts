// lib/graph.ts — normalização de grafo vindo de fora (arquivo importado, ~/.graphene, API).
// Puro e usado nos dois lados: o canvas nunca recebe nó sem tipo válido, posição numérica ou aresta órfã.
import type { Edge } from "@xyflow/react";
import { KIND_LABEL, type PieceData, type PieceKind, type PieceNode } from "./types";

const KINDS: PieceKind[] = ["input", "worker", "supervisor", "output"];
const DEFAULT_RETRIES = 5;
const MAX_RETRIES = 50;

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const retries = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_RETRIES, Math.max(1, n)) : DEFAULT_RETRIES;
};

const text = (v: unknown, fallback = ""): string => (v == null ? fallback : String(v));

/** Mantém só nós coerentes: tipo conhecido, id único e não vazio, posição numérica. */
export function normalizeNodes(input: unknown): PieceNode[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: PieceNode[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    const id = text(n.id).trim();
    const type = n.type as PieceKind;
    if (!id || seen.has(id) || !KINDS.includes(type)) continue;
    seen.add(id);
    const pos = (n.position ?? {}) as Record<string, unknown>;
    const data = (n.data ?? {}) as Record<string, unknown>;
    const clean: PieceData = {
      label: text(data.label, KIND_LABEL[type]),
      systemPrompt: text(data.systemPrompt),
      maxRetries: retries(data.maxRetries),
      feedback: text(data.feedback),
    };
    out.push({ id, type, position: { x: num(pos.x), y: num(pos.y) }, data: clean } as PieceNode);
  }
  return out;
}

/** Mantém só arestas que apontam para nós existentes, com id único. Sempre no estilo bezier. */
export function normalizeEdges(input: unknown, nodeIds: Iterable<string>): Edge[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(nodeIds);
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const source = text(e.source);
    const target = text(e.target);
    if (!known.has(source) || !known.has(target)) continue;
    const id = text(e.id).trim() || `e_${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id, source, target, type: "bezier",
      sourceHandle: e.sourceHandle == null ? undefined : text(e.sourceHandle),
      targetHandle: e.targetHandle == null ? undefined : text(e.targetHandle),
      label: text(e.label),
    });
  }
  return out;
}

/** Normaliza o grafo inteiro. Aresta órfã cai fora junto com o nó que sumiu. */
export function normalizeGraph(input: unknown): { nodes: PieceNode[]; edges: Edge[] } {
  const obj = (input ?? {}) as Record<string, unknown>;
  const nodes = normalizeNodes(obj.nodes);
  return { nodes, edges: normalizeEdges(obj.edges, nodes.map((n) => n.id)) };
}
