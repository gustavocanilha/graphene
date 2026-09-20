import type { Edge } from "@xyflow/react";
import type { PieceNode } from "./types";

export type Issue = { level: "error" | "warn"; text: string };

/** Validação em tempo real do grafo, exibida no card ANTES DE EXPORTAR. */
export function validateGraph(nodes: PieceNode[], edges: Edge[]): Issue[] {
  const issues: Issue[] = [];
  if (nodes.length === 0) return [{ level: "error", text: "Grafo vazio. Adicione peças." }];

  const hasInput = nodes.some((n) => n.type === "input");
  const hasOutput = nodes.some((n) => n.type === "output");
  if (!hasInput) issues.push({ level: "error", text: "Falta nó Entrada." });
  if (!hasOutput) issues.push({ level: "error", text: "Falta nó Entrega." });

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const alone = nodes.filter((n) => nodes.length > 1 && !connected.has(n.id));
  if (alone.length > 0)
    issues.push({ level: "error", text: `${alone.length} nó(s) desconectado(s): ${alone.map((n) => String(n.data?.label ?? n.id)).join(", ")}.` });

  const noPrompt = nodes.filter((n) => !String(n.data?.systemPrompt ?? "").trim());
  if (noPrompt.length > 0)
    issues.push({ level: "error", text: `Sem system prompt: ${noPrompt.map((n) => String(n.data?.label ?? n.id)).join(", ")}.` });

  const sups = nodes.filter((n) => n.type === "supervisor");
  for (const s of sups) {
    const out = edges.filter((e) => e.source === s.id);
    if (out.length < 2)
      issues.push({ level: "warn", text: `Supervisor "${String(s.data?.label ?? s.id)}" precisa de 2 saídas (aprovado e feedback).` });
  }
  // O gerador LangGraph trabalha com um único supervisor; avisar é melhor que exportar código pela metade.
  if (sups.length > 1)
    issues.push({ level: "error", text: `Só o primeiro supervisor entra no LangGraph exportado. Remova os outros ${sups.length - 1}.` });

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}

/** Contagem por severidade, para o resumo do painel de validação. */
export function countIssues(issues: Issue[]): { errors: number; warns: number } {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warns: issues.filter((i) => i.level === "warn").length,
  };
}
