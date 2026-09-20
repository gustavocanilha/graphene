import type { Edge, Node } from "@xyflow/react";

export type PieceKind = "input" | "worker" | "supervisor" | "output";

export type PieceData = {
  label: string;
  systemPrompt: string;
  maxRetries: number;
  feedback: string;
  [key: string]: unknown;
};

export type PieceNode = Node<PieceData, PieceKind>;
export type GraphEdges = Edge[];

export const KIND_LABEL: Record<PieceKind, string> = {
  input: "Entrada",
  worker: "Trabalhador",
  supervisor: "Supervisor",
  output: "Entrega",
};

export function uid(prefix = "n"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

// Numeração por tipo: "Trabalhador 1", "Trabalhador 2"... Maior número existente + 1.
export function nextLabel(kind: PieceKind, nodes: PieceNode[] = []): string {
  const base = KIND_LABEL[kind];
  const re = new RegExp(`^${base} (\\d+)$`, "i");
  let max = 0;
  for (const n of nodes) {
    if (n.type !== kind) continue;
    const m = re.exec(String(n.data?.label ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${base} ${max + 1}`;
}

export function defaultData(kind: PieceKind, nodes: PieceNode[] = []): PieceData {
  const label = nextLabel(kind, nodes);
  switch (kind) {
    case "input":
      return { label, systemPrompt: "Receba o prompt inicial e passe adiante sem alterar.", maxRetries: 3, feedback: "" };
    case "worker":
      return { label, systemPrompt: "Execute a tarefa com capricho. Produza artefato final.", maxRetries: 3, feedback: "" };
    case "supervisor":
      return { label, systemPrompt: "Avalie o artefato. Aprove só se cumprir os critérios.", maxRetries: 5, feedback: "Aponte o defeito exato e como corrigir." };
    case "output":
      return { label, systemPrompt: "Consolide o artefato aprovado em resposta final.", maxRetries: 3, feedback: "" };
  }
}
