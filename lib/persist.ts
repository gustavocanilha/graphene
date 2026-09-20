// lib/persist.ts — único ponto de acesso ao backend de grafos (/api/graphs -> ~/.graphene).
// Centraliza fetch, tratamento de erro e a assinatura de conteúdo usada pelo autosave.
import type { Edge } from "@xyflow/react";
import type { PieceNode } from "./types";

export type GraphPayload = { name: string; title: string; nodes: PieceNode[]; edges: Edge[] };

/** Estado do autosave exibido na barra superior. */
export type SaveState = { kind: "idle" | "saving" | "saved" | "error"; at?: string };

const API = "/api/graphs";

/** fetch + erro explícito: nunca devolve sucesso falso. */
async function req(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Salva o grafo. Lança erro quando a API recusa ou está offline. */
export async function saveGraph(payload: GraphPayload): Promise<void> {
  await req(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Lista os nomes dos grafos salvos. */
export async function listGraphs(): Promise<string[]> {
  const d = (await req(API)) as { graphs?: string[] };
  return d.graphs ?? [];
}

/** Carrega um grafo pelo nome. Devolve null quando não existe (404). */
export async function loadGraph(name: string): Promise<GraphPayload | null> {
  try {
    return (await req(`${API}?id=${encodeURIComponent(name)}`)) as GraphPayload;
  } catch {
    return null;
  }
}

/** Apaga um grafo pelo nome. Lança erro quando a API recusa. */
export async function deleteGraph(name: string): Promise<void> {
  await req(`${API}?id=${encodeURIComponent(name)}`, { method: "DELETE" });
}

/**
 * Assinatura do conteúdo do grafo, ignorando campos voláteis (selected, dragging,
 * measured). Serve para o autosave não gravar de novo quando o usuário apenas
 * clica/seleciona um nó.
 */
export function graphSignature(payload: GraphPayload): string {
  return JSON.stringify({
    name: payload.name,
    title: payload.title,
    nodes: payload.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: payload.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: e.label,
    })),
  });
}
