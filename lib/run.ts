// lib/run.ts — executa o grafo desenhado contra um endpoint OpenAI-compatible.
// A regra de roteamento espelha lib/export.ts: supervisor decide aprovado/reprovado e o teto vira melhor esforço.
import type { Edge } from "@xyflow/react";
import type { PieceKind, PieceNode } from "./types";

export type RunConfig = { baseUrl: string; apiKey: string; model: string };
export type ChatMessage = { role: "system" | "user"; content: string };
export type ModelUsage = { prompt: number; completion: number; total: number };
export type ModelReply = { text: string; usage?: ModelUsage };
export type CallModel = (messages: ChatMessage[], config: RunConfig) => Promise<ModelReply>;

export type RunStep = {
  nodeId: string;
  kind: PieceKind;
  label: string;
  round: number;
  text: string;
  approved?: boolean;
  feedback?: string;
  usage?: ModelUsage;
  ms: number;
};

export type RunResult = {
  steps: RunStep[];
  final: string;
  approved: boolean;
  capped: boolean;
  rounds: number;
  usage: ModelUsage;
};

const MAX_STEPS = 100;
const DEADLINE_MS = 10 * 60_000;

const isLoopEdge = (e: Edge) => /loop|reprov|feedback/i.test(`${e.sourceHandle ?? ""} ${String(e.label ?? "")}`);

function maxRetriesOf(node: PieceNode): number {
  const n = Number(node.data.maxRetries);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 5;
}

/** Interpreta o veredito do supervisor: JSON (com ou sem cerca de código) e, se falhar, texto solto. */
export function parseVerdict(raw: string): { approved: boolean; feedback: string } {
  const clean = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const d = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
      const a = d.aprovado;
      if (typeof a === "boolean" || typeof a === "string" || typeof a === "number") {
        const approved = a === true || a === 1 || /^(true|sim|yes|aprovado)$/i.test(String(a));
        return { approved, feedback: typeof d.feedback === "string" ? d.feedback.trim() : "" };
      }
    } catch {
      // cai no heurístico abaixo
    }
  }
  const low = clean.toLowerCase();
  const rejected = /reprovad|rejected|não aprovad|nao aprovad|not approved/.test(low);
  const approved = /aprovad|approved/.test(low);
  // Sem veredito reconhecível, repetir o laço só queima tokens: falha claro e cedo.
  if (!rejected && !approved) {
    throw new Error(`Supervisor sem veredito reconhecível: "${clean.slice(0, 200)}". Peça aprovado/reprovado no prompt do supervisor.`);
  }
  return { approved: approved && !rejected, feedback: approved && !rejected ? "" : clean.slice(0, 2000) };
}

function workerMessages(node: PieceNode, input: string, artifact: string, feedback: string): ChatMessage[] {
  const user = feedback
    ? `Objetivo:\n${input}\n\nTrabalho anterior:\n${artifact}\n\nFeedback do supervisor:\n${feedback}\n\nRefaça o trabalho corrigindo o feedback. Responda apenas com o artefato.`
    : artifact
      ? `Objetivo:\n${input}\n\nTrabalho anterior:\n${artifact}\n\nContinue a partir do trabalho anterior. Responda apenas com o artefato.`
      : `Objetivo:\n${input}\n\nProduza o artefato. Responda apenas com o artefato.`;
  return [
    { role: "system", content: String(node.data.systemPrompt || "") },
    { role: "user", content: user },
  ];
}

function supervisorMessages(node: PieceNode, artifact: string): ChatMessage[] {
  return [
    { role: "system", content: String(node.data.systemPrompt || "") },
    {
      role: "user",
      content: `Artefato a avaliar:\n${artifact}\n\nResponda APENAS com um objeto JSON: {"aprovado": true, "feedback": "..."}. Use "aprovado": false quando precisar de correção.`,
    },
  ];
}

function outputMessages(node: PieceNode, input: string, artifact: string): ChatMessage[] {
  return [
    { role: "system", content: String(node.data.systemPrompt || "") },
    { role: "user", content: `Pedido original:\n${input}\n\nArtefato aprovado:\n${artifact}\n\nEntregue a resposta final.` },
  ];
}

/** Cliente mínimo do protocolo /chat/completions. Funciona com OpenAI, OpenRouter, Groq, Ollama e LM Studio. */
export async function callOpenAI(messages: ChatMessage[], config: RunConfig): Promise<ModelReply> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, temperature: 0.7, messages }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Endpoint respondeu ${res.status}: ${detail.slice(0, 300) || "sem corpo"}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Endpoint não devolveu choices[0].message.content.");
  const u = data.usage;
  return {
    text,
    usage: u
      ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, total: u.total_tokens ?? 0 }
      : undefined,
  };
}

/**
 * Percorre o grafo a partir da Entrada. Cada nó chama o modelo; o supervisor decide o caminho.
 * `call` é injetável para teste e para trocar o transporte sem mexer na regra do laço.
 */
export async function runGraph(
  nodes: PieceNode[],
  edges: Edge[],
  input: string,
  config: RunConfig,
  call: CallModel = callOpenAI,
): Promise<RunResult> {
  if (!nodes.length) throw new Error("Grafo vazio.");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inputNode = nodes.find((n) => n.type === "input");
  const sup = nodes.find((n) => n.type === "supervisor");
  const outNode = nodes.find((n) => n.type === "output");
  const start = inputNode ?? nodes.find((n) => !edges.some((e) => e.target === n.id)) ?? nodes[0];

  const state = { artifact: "", feedback: "", rounds: 0, rejections: 0, approved: false, capped: false };
  const steps: RunStep[] = [];
  const usage: ModelUsage = { prompt: 0, completion: 0, total: 0 };
  const deadline = Date.now() + DEADLINE_MS;

  // Sem aresta de saída, cai para o supervisor e depois para a Entrega: mesmo fallback do export.
  const next = (node: PieceNode): PieceNode | undefined => {
    if (node.type === "output") return undefined;
    const target = edges.find((e) => e.source === node.id)?.target;
    if (target) return byId.get(target);
    if (sup && node.id !== sup.id) return sup;
    if (outNode && node.id !== outNode.id) return outNode;
    return undefined;
  };

  const ask = async (node: PieceNode, kind: PieceKind, round: number, messages: ChatMessage[]) => {
    const started = Date.now();
    const reply = await call(messages, config);
    if (reply.usage) {
      usage.prompt += reply.usage.prompt;
      usage.completion += reply.usage.completion;
      usage.total += reply.usage.total;
    }
    return { reply, ms: Date.now() - started, kind, round };
  };

  let current: PieceNode | undefined = start;
  while (current) {
    if (steps.length >= MAX_STEPS) throw new Error(`Laço longo demais (mais de ${MAX_STEPS} passos).`);
    if (Date.now() > deadline) throw new Error("Tempo esgotado (10 min). Reduza o max_retries ou o input.");
    const node = current;
    const kind = node.type;
    if (!kind) throw new Error("Peça sem tipo.");
    current = undefined;

    if (kind === "input") {
      state.artifact = input;
      current = next(node);
      continue;
    }

    if (kind === "worker") {
      state.rounds += 1;
      const { reply, ms } = await ask(node, kind, state.rounds, workerMessages(node, input, state.artifact, state.feedback));
      state.artifact = reply.text.trim();
      state.feedback = "";
      steps.push({ nodeId: node.id, kind, label: String(node.data.label), round: state.rounds, text: state.artifact, usage: reply.usage, ms });
      current = next(node);
      continue;
    }

    if (kind === "supervisor") {
      const { reply, ms } = await ask(node, kind, state.rounds, supervisorMessages(node, state.artifact));
      const verdict = parseVerdict(reply.text);
      state.approved = verdict.approved;
      if (!verdict.approved) state.rejections += 1;
      state.capped = !verdict.approved && state.rejections >= maxRetriesOf(node);
      steps.push({
        nodeId: node.id, kind, label: String(node.data.label), round: state.rounds,
        text: verdict.feedback || (verdict.approved ? "Aprovado." : "Rejeitado sem feedback."),
        approved: verdict.approved, feedback: verdict.feedback, usage: reply.usage, ms,
      });

      const out = edges.filter((e) => e.source === node.id);
      if (verdict.approved || state.capped) {
        const okEdge = out.find((e) => e.sourceHandle === "ok") ?? out.find((e) => !isLoopEdge(e));
        current = (okEdge && byId.get(okEdge.target)) || (outNode && outNode.id !== node.id ? outNode : undefined);
      } else {
        state.feedback = verdict.feedback || "Corrija o artefato conforme os critérios.";
        const loopEdge = out.find((e) => e.sourceHandle === "loop") ?? out.find(isLoopEdge);
        current = loopEdge ? byId.get(loopEdge.target) : undefined;
      }
      continue;
    }

    const { reply, ms } = await ask(node, kind, state.rounds, outputMessages(node, input, state.artifact));
    const text = reply.text.trim();
    steps.push({ nodeId: node.id, kind, label: String(node.data.label), round: state.rounds, text, usage: reply.usage, ms });
    state.artifact = text;
  }

  return {
    steps,
    final: state.artifact,
    approved: sup ? state.approved || state.capped : true,
    capped: state.capped,
    rounds: state.rounds,
    usage,
  };
}
