// lib/edges.ts — regra de cor das arestas. Puro, sem React: dá para testar direto.
export type EdgeTone = "ok" | "loop" | "neutral";

export type ToneStyle = { stroke: string; text: string; border: string };

export const TONES: Record<EdgeTone, ToneStyle> = {
  ok: { stroke: "#22c55e", text: "#15803d", border: "#22c55e" },
  loop: { stroke: "#ef4444", text: "#b91c1c", border: "#ef4444" },
  neutral: { stroke: "#b1b1b7", text: "#31302e", border: "#e6e6e6" },
};

/** Rótulo e manopla decidem a cor: aprovado = verde, reprovado/feedback = vermelho. */
export function edgeTone(label: unknown, sourceHandle: unknown): EdgeTone {
  const s = `${String(label ?? "")} ${String(sourceHandle ?? "")}`.toLowerCase();
  if (/reprov|feedback|loop/.test(s)) return "loop";
  if (/aprov/.test(s)) return "ok";
  return "neutral";
}

/** Estilo aplicado a uma aresta. A cor só vale quando ela sai do supervisor. */
export function edgeStyle(tone: EdgeTone, fromSupervisor: boolean): ToneStyle {
  return TONES[fromSupervisor ? tone : "neutral"];
}
