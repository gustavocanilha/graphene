import type { Edge } from "@xyflow/react";
import type { PieceNode } from "./types";

function pyId(s: string): string {
  const clean = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return clean || "no";
}

function pyStr(s: string): string {
  return `"""${s.replace(/"""/g, '" " "').trim()}"""`;
}

/**
 * 1. Python LangGraph executável: TypedDict + nós puros + conditional_edges + trava max_retries.
 * A fiação segue as arestas desenhadas; sem aresta, cai no fluxo linear padrão.
 */
export function toPython(nodes: PieceNode[], edges: Edge[]): string {
  const sup = nodes.find((n) => n.type === "supervisor");
  const maxRetries = Number(sup?.data.maxRetries ?? 5);
  const workers = nodes.filter((n) => n.type === "worker");
  const mainWorker = workers[0];
  const output = nodes.find((n) => n.type === "output");
  const input = nodes.find((n) => n.type === "input");

  const fnNames = new Map<string, string>();
  const used = new Set<string>();
  for (const n of nodes) {
    let base = pyId(String(n.data.label || n.type));
    if (used.has(base)) base = `${base}_${n.id.slice(-4)}`;
    used.add(base);
    fnNames.set(n.id, base);
  }

  const nodeBlocks = nodes.map((n) => {
    const fn = fnNames.get(n.id)!;
    return `def ${fn}(state: GraphState) -> GraphState:\n    """${String(n.type).toUpperCase()}: ${String(n.data.label).replace(/"/g, "'")}"""\n    system = ${pyStr(String(n.data.systemPrompt || ""))}\n    # TODO: chamar seu LLM aqui com system + state["input"]\n    # resp = llm(system, state["artefato"] or state["input"])\n    return {**state, "artefato": state.get("artefato") or state["input"], "tentativas": state.get("tentativas", 0) + 1}`;
  }).join("\n\n\n");

  const entryFn = input ? fnNames.get(input.id)! : fnNames.get(nodes[0]?.id ?? "") ?? "entrada";
  const workerFn = mainWorker ? fnNames.get(mainWorker.id)! : entryFn;
  const supFn = sup ? fnNames.get(sup.id)! : workerFn;
  const outFn = output ? fnNames.get(output.id)! : workerFn;

  // Alvos das arestas realmente desenhadas; fallback no fluxo linear quando a aresta não existe.
  const supOut = sup ? edges.filter((e) => e.source === sup.id) : [];
  const isLoopEdge = (e: Edge) => /loop|reprov|feedback/i.test(`${e.sourceHandle ?? ""} ${String(e.label ?? "")}`);
  const okEdge = supOut.find((e) => e.sourceHandle === "ok") ?? supOut.find((e) => !isLoopEdge(e));
  const loopEdge = supOut.find((e) => e.sourceHandle === "loop") ?? supOut.find(isLoopEdge);
  const approvedFn = (okEdge && fnNames.get(okEdge.target)) || outFn;
  const loopFn = (loopEdge && fnNames.get(loopEdge.target)) || workerFn;

  // Arestas viram add_edge; o supervisor entra pelo shim _check e sai por conditional_edges.
  const nameInFlow = (id: string) => (sup && id === sup.id ? `${supFn}_check` : fnNames.get(id));
  const wires: string[] = [];
  const seen = new Set<string>();
  const wire = (from: string, to: string, rawTo = false) => {
    const key = `${from}->${to}`;
    if (from === to || seen.has(key)) return;
    seen.add(key);
    wires.push(`builder.add_edge("${from}", ${rawTo ? to : `"${to}"`})`);
  };
  for (const e of edges) {
    if (sup && e.source === sup.id) continue;
    const from = nameInFlow(e.source);
    const to = nameInFlow(e.target);
    if (from && to) wire(from, to);
  }
  if (!edges.some((e) => e.source === input?.id)) wire(entryFn, workerFn);
  if (!edges.some((e) => e.source === mainWorker?.id)) wire(workerFn, `${supFn}_check`);
  const outNodes = nodes.filter((n) => n.type === "output");
  if (outNodes.length) outNodes.forEach((n) => wire(fnNames.get(n.id)!, "END", true));
  else wire(outFn, "END", true);

  const feedback = String(sup?.data.feedback || "Aponte o defeito exato e como corrigir.").replace(/"/g, "'");

  return `# Gerado por Graphene — LangGraph executável
# pip install langgraph
from typing import TypedDict
from langgraph.graph import StateGraph, END


class GraphState(TypedDict):
    input: str
    artefato: str
    aprovado: bool
    tentativas: int


${nodeBlocks}


def roteador(state: GraphState) -> str:
    if state.get("aprovado"):
        return "aprovado"
    if state.get("tentativas", 0) >= ${maxRetries}:
        return "aprovado"  # trava max_retries: entrega melhor esforço
    return "reprovado"


def ${supFn}_check(state: GraphState) -> GraphState:
    """Supervisor: avalie state['artefato'] contra os critérios.
    Feedback loop: "${feedback}"
    Defina state['aprovado'] = True/False aqui (ou via LLM juiz)."""
    return {**state, "aprovado": state.get("aprovado", False)}


builder = StateGraph(GraphState)
for nome, fn in [${nodes.map((n) => `("${fnNames.get(n.id)}", ${fnNames.get(n.id)})`).join(", ")}]:
    builder.add_node(nome, fn)
builder.add_node("${supFn}_check", ${supFn}_check)

builder.set_entry_point("${entryFn}")
${wires.join("\n")}
builder.add_conditional_edges("${supFn}_check", roteador, {"aprovado": "${approvedFn}", "reprovado": "${loopFn}"})

grafo = builder.compile()

if __name__ == "__main__":
    final = grafo.invoke({"input": "seu prompt aqui", "artefato": "", "aprovado": False, "tentativas": 0})
    print(final["artefato"])
`;
}

/** 2. Payload JSON: nodes, edges, prompts, conditions, max_retries. */
export function toJsonPayload(nodes: PieceNode[], edges: Edge[]): string {
  const sups = nodes.filter((n) => n.type === "supervisor");
  const maxRetries = Math.max(0, ...sups.map((n) => Number(n.data.maxRetries ?? 0)), 3);
  const payload = {
    version: "graphene/1",
    max_retries: sups.length ? Number(sups[0].data.maxRetries ?? maxRetries) : maxRetries,
    nodes: nodes.map((n) => ({
      id: n.id, kind: n.type, label: n.data.label,
      systemPrompt: n.data.systemPrompt, maxRetries: n.data.maxRetries,
      feedback: n.data.feedback, position: n.position,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label ?? "" })),
    prompts: Object.fromEntries(nodes.map((n) => [n.id, n.data.systemPrompt])),
    conditions: sups.map((s) => ({
      supervisorId: s.id,
      approvedEdge: edges.find((e) => e.source === s.id && /aprov/i.test(String(e.label ?? "")))?.id ?? null,
      feedbackEdge: edges.find((e) => e.source === s.id && /reprov|feedback|loop/i.test(String(e.label ?? "")))?.id ?? null,
      feedback: s.data.feedback,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** 3. Markdown metaprompt: LLM como orquestrador Trabalhador -> Supervisor -> Entrega. */
export function toMarkdown(nodes: PieceNode[], edges: Edge[]): string {
  const line = (n: PieceNode) =>
    `### ${n.data.label} (${n.type})\n- System: ${String(n.data.systemPrompt || "—").trim()}` +
    (n.type === "supervisor" ? `\n- max_retries: ${n.data.maxRetries}\n- Feedback loop: ${String(n.data.feedback || "—").trim()}` : "");
  const route = edges.map((e) => {
    const a = nodes.find((n) => n.id === e.source)?.data.label ?? e.source;
    const b = nodes.find((n) => n.id === e.target)?.data.label ?? e.target;
    return `- ${a} --[${e.label || "segue"}]--> ${b}`;
  }).join("\n");
  return `# Orquestrador — grafo Graphene\n\nVocê é o orquestrador. Simule cada peça em ordem, sem pular etapas.\n\n## Peças\n\n${nodes.map(line).join("\n\n")}\n\n## Rotas\n\n${route || "- fluxo linear"}\n\n## Protocolo\n\n1. Comece na Entrada com o input do usuário.\n2. Trabalhador produz artefato completo.\n3. Supervisor julga contra os critérios. Se reprovar, devolva com feedback exato e mande o Trabalhador refazer.\n4. Repita até aprovar ou bater max_retries (entregue melhor esforço e declare o limite).\n5. Entrega consolida resposta final, sem mencionar o processo interno.\n`;
}

function yamlQ(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** 4. Skill Hermes (YAML): salve em ~/.hermes/skills/<nome>.yaml e carregue com agent.load_skill_from_file. */
export function toHermesSkill(nodes: PieceNode[], edges: Edge[], title = "grafo"): string {
  void edges;
  const name = pyId(title) || "grafo";
  const inputs = nodes.filter((n) => n.type === "input");
  const workers = nodes.filter((n) => n.type === "worker");
  const sups = nodes.filter((n) => n.type === "supervisor");
  const outputs = nodes.filter((n) => n.type === "output");
  const desc = String(inputs[0]?.data.systemPrompt || workers[0]?.data.systemPrompt || title).split("\n")[0].slice(0, 140);

  const steps: string[] = [];
  workers.forEach((w) => steps.push(`${steps.length + 1}. ${String(w.data.label)}: ${String(w.data.systemPrompt || "").trim()}`));
  sups.forEach((s) => steps.push(
    `${steps.length + 1}. ${String(s.data.label)} (juiz): ${String(s.data.systemPrompt || "").trim()} ` +
    `Se reprovar, devolva com este feedback e refaça (max ${s.data.maxRetries} rodadas): ${String(s.data.feedback || "").trim()}`
  ));
  outputs.forEach((o) => steps.push(`${steps.length + 1}. ${String(o.data.label)}: ${String(o.data.systemPrompt || "").trim()}`));

  const params = inputs.map((n) =>
    `  - name: ${pyId(String(n.data.label)) || "input"}\n    type: string\n    required: true\n    description: ${yamlQ(String(n.data.systemPrompt || "").split("\n")[0].slice(0, 140))}`
  ).join("\n");

  return `# Gerado por Graphene — Skill Hermes
# Salve em ~/.hermes/skills/${name}.yaml e carregue com agent.load_skill_from_file
name: ${name}
description: ${yamlQ(desc)}
version: 1.0.0

parameters:
${params || "  - name: input\n    type: string\n    required: true\n    description: Entrada do usuario"}

instructions: |
${steps.map((s) => `  ${s}`).join("\n") || "  (grafo vazio)"}

examples:
  - input:
      input: "<entrada do usuario>"
    output: "<artefato aprovado pelos criterios do supervisor>"

metadata:
  author: graphene
  tags: [${Array.from(new Set(nodes.map((n) => String(n.type)))).join(", ")}]
  auto_improve: true
  max_retries: ${sups.length ? Number(sups[0].data.maxRetries ?? 3) : 3}
`;
}
