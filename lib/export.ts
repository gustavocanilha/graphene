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
 * 1. Python LangGraph executável: TypedDict + nós que chamam um endpoint OpenAI-compatible
 * + conditional_edges + trava max_retries. A fiação segue as arestas desenhadas; sem aresta,
 * cai no fluxo linear padrão.
 */
export function toPython(nodes: PieceNode[], edges: Edge[]): string {
  const sup = nodes.find((n) => n.type === "supervisor");
  const workers = nodes.filter((n) => n.type === "worker");
  const mainWorker = workers[0];
  const output = nodes.find((n) => n.type === "output");
  const input = nodes.find((n) => n.type === "input");
  const rawMax = Number(sup?.data.maxRetries);
  const maxRetries = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 5;

  const fnNames = new Map<string, string>();
  const used = new Set<string>();
  for (const n of nodes) {
    let base = pyId(String(n.data.label || n.type));
    if (used.has(base)) base = `${base}_${n.id.slice(-4)}`;
    used.add(base);
    fnNames.set(n.id, base);
  }

  const doc = (n: PieceNode) =>
    `"""${String(n.type).toUpperCase()}: ${String(n.data.label).replace(/\\/g, "\\\\").replace(/"/g, "'")}"""`;
  const nodeBlocks = nodes.map((n) => {
    const fn = fnNames.get(n.id)!;
    const system = pyStr(String(n.data.systemPrompt || ""));
    if (n.type === "input") {
      return `def ${fn}(state: GraphState) -> GraphState:\n    ${doc(n)}\n    return {**state, "artefato": state["input"]}`;
    }
    if (n.type === "supervisor") {
      return `def ${fn}(state: GraphState) -> GraphState:\n    ${doc(n)}\n    system = ${system}\n    user = (\n        "Artefato a avaliar:\\n" + state.get("artefato", "")\n        + '\\n\\nResponda APENAS com JSON: {"aprovado": true, "feedback": "..."}'\n    )\n    veredito = _parse_veredito(call_llm(system, user))\n    return {\n        **state,\n        "aprovado": veredito["aprovado"],\n        "feedback": veredito["feedback"],\n        "tentativas": state.get("tentativas", 0) + (0 if veredito["aprovado"] else 1),\n    }`;
    }
    if (n.type === "output") {
      return `def ${fn}(state: GraphState) -> GraphState:\n    ${doc(n)}\n    system = ${system}\n    user = f"Pedido original:\\n{state['input']}\\n\\nArtefato aprovado:\\n{state.get('artefato', '')}\\n\\nEntregue a resposta final."\n    return {**state, "artefato": call_llm(system, user)}`;
    }
    return `def ${fn}(state: GraphState) -> GraphState:\n    ${doc(n)}\n    system = ${system}\n    if state.get("feedback"):\n        user = f"Objetivo:\\n{state['input']}\\n\\nTrabalho anterior:\\n{state.get('artefato', '')}\\n\\nFeedback do supervisor:\\n{state['feedback']}\\n\\nRefaça corrigindo o feedback."\n    elif state.get("artefato"):\n        user = f"Objetivo:\\n{state['input']}\\n\\nTrabalho anterior:\\n{state.get('artefato', '')}\\n\\nContinue a partir do trabalho anterior."\n    else:\n        user = f"Objetivo:\\n{state['input']}\\n\\nProduza o artefato."\n    return {**state, "artefato": call_llm(system, user)}`;
  }).join("\n\n\n");

  const entryFn = input ? fnNames.get(input.id)! : fnNames.get(nodes[0]?.id ?? "") ?? "entrada";
  const workerFn = mainWorker ? fnNames.get(mainWorker.id)! : entryFn;
  const supFn = sup ? fnNames.get(sup.id)! : workerFn;

  // Alvos das arestas realmente desenhadas; fallback no fluxo linear quando a aresta não existe.
  const supOut = sup ? edges.filter((e) => e.source === sup.id) : [];
  const isLoopEdge = (e: Edge) => /loop|reprov|feedback/i.test(`${e.sourceHandle ?? ""} ${String(e.label ?? "")}`);
  const okEdge = supOut.find((e) => e.sourceHandle === "ok") ?? supOut.find((e) => !isLoopEdge(e));
  const loopEdge = supOut.find((e) => e.sourceHandle === "loop") ?? supOut.find(isLoopEdge);
  const approvedFn = (okEdge && fnNames.get(okEdge.target)) || (output ? fnNames.get(output.id)! : "END");
  const loopFn = (loopEdge && fnNames.get(loopEdge.target)) || workerFn;

  // Arestas viram add_edge; o supervisor sai por conditional_edges.
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
    const from = fnNames.get(e.source);
    const to = fnNames.get(e.target);
    if (from && to) wire(from, to);
  }
  if (input && !edges.some((e) => e.source === input.id)) {
    if (mainWorker) wire(entryFn, workerFn);
    else if (sup) wire(entryFn, supFn);
  }
  if (mainWorker && sup && !edges.some((e) => e.source === mainWorker.id)) wire(workerFn, supFn);
  for (const n of nodes.filter((x) => x.type === "output")) wire(fnNames.get(n.id)!, "END", true);

  const router = sup ? `def roteador(state: GraphState) -> str:
    if state.get("aprovado"):
        return "aprovado"
    if state.get("tentativas", 0) >= ${maxRetries}:
        return "aprovado"  # trava max_retries: entrega melhor esforço
    return "reprovado"` : "";
  const conditional = sup
    ? `builder.add_conditional_edges("${supFn}", roteador, {"aprovado": "${approvedFn}", "reprovado": "${loopFn}"})`
    : "";

  return `# Gerado por Graphene — LangGraph executável
# pip install langgraph
# Variáveis: OPENAI_API_KEY, OPENAI_BASE_URL (padrão https://api.openai.com/v1) e OPENAI_MODEL (padrão gpt-4o-mini).
import json
import os
import urllib.request
from typing import TypedDict
from langgraph.graph import StateGraph, END


class GraphState(TypedDict):
    input: str
    artefato: str
    aprovado: bool
    feedback: str
    tentativas: int


def call_llm(system: str, user: str) -> str:
    base = (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    key = os.environ.get("OPENAI_API_KEY") or ""
    model = os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"
    body = json.dumps({
        "model": model,
        "temperature": 0.7,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{base}/chat/completions", data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def _parse_veredito(texto: str) -> dict:
    limpo = texto.replace("\`\`\`json", "").replace("\`\`\`", "").strip()
    inicio, fim = limpo.find("{"), limpo.rfind("}")
    if inicio >= 0 and fim > inicio:
        try:
            d = json.loads(limpo[inicio:fim + 1])
            if isinstance(d.get("aprovado"), bool):
                return {"aprovado": d["aprovado"], "feedback": str(d.get("feedback", ""))}
        except json.JSONDecodeError:
            pass
    baixo = limpo.lower()
    reprovado = "reprovad" in baixo or "não aprovad" in baixo or "nao aprovad" in baixo
    aprovado = not reprovado and "aprovad" in baixo
    return {"aprovado": aprovado, "feedback": "" if aprovado else limpo[:2000]}


${nodeBlocks}

${router}

builder = StateGraph(GraphState)
for nome, fn in [${nodes.map((n) => `("${fnNames.get(n.id)}", ${fnNames.get(n.id)})`).join(", ")}]:
    builder.add_node(nome, fn)

builder.set_entry_point("${entryFn}")
${wires.join("\n")}
${conditional}

grafo = builder.compile()

if __name__ == "__main__":
    final = grafo.invoke({"input": "seu prompt aqui", "artefato": "", "aprovado": False, "feedback": "", "tentativas": 0})
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
