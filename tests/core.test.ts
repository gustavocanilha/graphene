import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Edge } from "@xyflow/react";
import { defaultData, nextLabel, type PieceKind, type PieceNode } from "../lib/types";
import { countIssues, hasErrors, validateGraph } from "../lib/validate";
import { toJsonPayload, toPython } from "../lib/export";
import { graphSignature, type GraphPayload } from "../lib/persist";
import { edgeStyle, edgeTone } from "../lib/edges";
import { normalizeGraph } from "../lib/graph";
import { autoLayout } from "../lib/layout";
import { callOpenAI, parseVerdict, runGraph, type CallModel, type ChatMessage } from "../lib/run";
import { badOrigin } from "../lib/http";

const N = (id: string, type: PieceKind, label: string): PieceNode => ({
  id, type, position: { x: 0, y: 0 },
  data: { label, systemPrompt: "prompt", maxRetries: 5, feedback: "feedback" },
});
const E = (id: string, source: string, target: string, label: string, sourceHandle?: string): Edge =>
  ({ id, source, target, label, sourceHandle, type: "bezier" });

const tail = (py: string) => py.split("builder = StateGraph")[1].split("grafo = builder.compile")[0];

test("nextLabel numera por tipo e ignora nomes fora do padrão", () => {
  assert.equal(nextLabel("worker", []), "Trabalhador 1");
  assert.equal(nextLabel("worker", [N("a", "worker", "Trabalhador 1"), N("b", "worker", "Trabalhador 2")]), "Trabalhador 3");
  assert.equal(nextLabel("worker", [N("a", "worker", "Trabalhador 7")]), "Trabalhador 8", "apagar 1 e 2 não pode repetir nome");
  assert.equal(nextLabel("output", [N("a", "output", "Minha entrega")]), "Entrega 1");
  assert.equal(nextLabel("supervisor", [N("a", "worker", "Trabalhador 9")]), "Supervisor 1", "contagem é por tipo");
});

test("defaultData sempre vem com rótulo numerado e prompt", () => {
  for (const kind of ["input", "worker", "supervisor", "output"] as PieceKind[]) {
    const d = defaultData(kind, []);
    assert.match(d.label, / 1$/);
    assert.ok(d.systemPrompt.trim().length > 0);
  }
});

test("validateGraph aponta faltas, supervisor incompleto e supervisor duplicado", () => {
  assert.ok(hasErrors(validateGraph([], [])));

  const semPontas = [N("w", "worker", "Trabalhador 1")];
  assert.ok(hasErrors(validateGraph(semPontas, [])));

  const sup1 = [N("i", "input", "Entrada 1"), N("s", "supervisor", "Supervisor 1"), N("o", "output", "Entrega 1")];
  const warn = validateGraph(sup1, [E("e1", "i", "s", "revisão"), E("e2", "s", "o", "aprovado", "ok")]);
  assert.equal(countIssues(warn).warns, 1, "supervisor com 1 saída pede aviso");

  const dois = [...sup1, N("s2", "supervisor", "Supervisor 2")];
  const err = validateGraph(dois, [E("e1", "i", "s", "revisão"), E("e2", "s", "o", "aprovado", "ok"), E("e3", "s", "s2", "reprovado/feedback", "loop")]);
  assert.equal(countIssues(err).errors, 1);
  assert.match(err.find((i) => i.level === "error")!.text, /primeiro supervisor/);
});

test("toPython segue as arestas desenhadas", () => {
  const nodes = [N("i", "input", "Entrada 1"), N("w1", "worker", "Trabalhador 1"), N("w2", "worker", "Trabalhador 2"), N("s", "supervisor", "Supervisor 1"), N("o", "output", "Entrega 1")];
  const edges = [
    E("e1", "i", "w1", "segue"), E("e2", "w1", "s", "revisão"),
    E("e3", "s", "o", "aprovado", "ok"), E("e4", "s", "w2", "reprovado/feedback", "loop"),
    E("e5", "w2", "s", "revisão"),
  ];
  const code = tail(toPython(nodes, edges));
  assert.match(code, /add_conditional_edges\("supervisor_1", roteador, \{"aprovado": "entrega_1", "reprovado": "trabalhador_2"\}\)/);
  assert.match(code, /builder\.add_edge\("trabalhador_2", "supervisor_1"\)/);
  assert.match(code, /builder\.add_edge\("entrega_1", END\)/);
  assert.doesNotMatch(code, /"reprovado": "trabalhador_1"/, "loop não pode voltar ao primeiro trabalhador");
});

test("toPython sem arestas cai no fluxo linear", () => {
  const nodes = [N("i", "input", "Entrada 1"), N("w", "worker", "Trabalhador 1"), N("s", "supervisor", "Supervisor 1"), N("o", "output", "Entrega 1")];
  const code = tail(toPython(nodes, []));
  assert.match(code, /builder\.add_edge\("entrada_1", "trabalhador_1"\)/);
  assert.match(code, /builder\.add_edge\("trabalhador_1", "supervisor_1"\)/);
  assert.match(code, /"reprovado": "trabalhador_1"/);
});

test("toJsonPayload marca as arestas de aprovação e de feedback", () => {
  const nodes = [N("s", "supervisor", "Supervisor 1")];
  const edges = [E("e1", "s", "o", "aprovado", "ok"), E("e2", "s", "w", "reprovado/feedback", "loop")];
  const payload = JSON.parse(toJsonPayload(nodes, edges));
  assert.equal(payload.conditions[0].approvedEdge, "e1");
  assert.equal(payload.conditions[0].feedbackEdge, "e2");
});

test("graphSignature ignora seleção e reage a conteúdo", () => {
  const base: GraphPayload = { name: "default", title: "Meu grafo", nodes: [N("i", "input", "Entrada 1")], edges: [] };
  const selecionado: GraphPayload = { ...base, nodes: [{ ...base.nodes[0], selected: true, dragging: true } as PieceNode] };
  assert.equal(graphSignature(base), graphSignature(selecionado));

  const renomeado: GraphPayload = { ...base, nodes: [N("i", "input", "Entrada 2")] };
  assert.notEqual(graphSignature(base), graphSignature(renomeado));
});

test("edgeTone e edgeStyle: cor só para aresta do supervisor", () => {
  assert.equal(edgeTone("aprovado", "ok"), "ok");
  assert.equal(edgeTone("reprovado/feedback", "loop"), "loop");
  assert.equal(edgeTone("revisão", undefined), "neutral");
  assert.equal(edgeStyle("ok", true).stroke, "#22c55e", "linha aprovada usa o mesmo verde da barra da Entrega");
  assert.equal(edgeStyle("ok", true).text, "#15803d", "texto do rótulo usa o degrau legível");
  assert.equal(edgeStyle("loop", true).stroke, "#ef4444", "linha reprovada usa o mesmo vermelho da barra do supervisor");
  assert.equal(edgeStyle("loop", true).text, "#b91c1c");
  assert.equal(edgeStyle("ok", false).stroke, "#b1b1b7", "fora do supervisor continua neutro");
});
test("normalizeGraph descarta lixo e mantém o grafo coerente", () => {
  const raw = {
    nodes: [
      { id: "a", type: "input", position: { x: "10", y: null }, data: { label: "Entrada 1" } },
      { id: "a", type: "worker", position: { x: 0, y: 0 }, data: {} },
      { id: "b", type: "teleporte", position: { x: 0, y: 0 }, data: {} },
      { id: "", type: "worker", position: { x: 0, y: 0 }, data: {} },
      { id: "c", type: "worker", position: { x: 5, y: 5 }, data: { maxRetries: 999, systemPrompt: 42 } },
    ],
    edges: [
      { id: "e1", source: "a", target: "c", label: "segue", type: "smoothstep" },
      { id: "e2", source: "a", target: "fantasma" },
      { id: "e1", source: "c", target: "a" },
    ],
  };
  const { nodes, edges } = normalizeGraph(raw);
  assert.deepEqual(nodes.map((n) => n.id), ["a", "c"], "id repetido, tipo desconhecido e id vazio caem fora");
  assert.deepEqual(nodes[0].position, { x: 10, y: 0 }, "posição vira número");
  assert.equal(nodes[1].data.maxRetries, 50, "maxRetries fora da faixa é limitado");
  assert.equal(nodes[1].data.systemPrompt, "42");
  assert.equal(nodes[1].data.label, "Trabalhador", "sem rótulo cai no nome do tipo");
  assert.deepEqual(edges.map((e) => e.id), ["e1"], "aresta órfã e id repetido caem fora");
  assert.equal(edges[0].type, "bezier", "aresta antiga é migrada para bezier");
  assert.deepEqual(normalizeGraph(null), { nodes: [], edges: [] });
});

test("autoLayout devolve o mesmo array quando não há nós", () => {
  const empty: PieceNode[] = [];
  assert.equal(autoLayout(empty, []), empty);
});

// --- Execução do grafo (lib/run.ts) ---

const P = (id: string, type: PieceKind, label: string, systemPrompt: string, maxRetries = 5): PieceNode => ({
  id, type, position: { x: 0, y: 0 }, data: { label, systemPrompt, maxRetries, feedback: "" },
});
const CFG = { baseUrl: "http://127.0.0.1:9/v1", model: "m", apiKey: "" };

function loopGraph(maxRetries = 2) {
  return {
    nodes: [
      P("i", "input", "Entrada 1", "receba"),
      P("w", "worker", "Trabalhador 1", "trabalhe"),
      P("s", "supervisor", "Supervisor 1", "julgue", maxRetries),
      P("o", "output", "Entrega 1", "entregue"),
    ],
    edges: [
      E("e1", "i", "w", "segue"), E("e2", "w", "s", "revisão"),
      E("e3", "s", "o", "aprovado", "ok"), E("e4", "s", "w", "reprovado/feedback", "loop"),
    ],
  };
}

test("runGraph itera, leva o feedback de volta e entrega", async () => {
  const { nodes, edges } = loopGraph(3);
  const calls: ChatMessage[][] = [];
  const call: CallModel = async (messages) => {
    calls.push(messages);
    const system = messages[0].content;
    if (system === "julgue") {
      const verdicts = calls.filter((c) => c[0].content === "julgue").length;
      return {
        text: verdicts === 1
          ? '```json\n{"aprovado": false, "feedback": "faltou X"}\n```'
          : '{"aprovado": true, "feedback": ""}',
      };
    }
    return { text: system === "entregue" ? "FINAL" : "ARTEFATO" };
  };

  const r = await runGraph(nodes, edges, "pedido", CFG, call);
  assert.deepEqual(r.steps.map((s) => s.kind), ["worker", "supervisor", "worker", "supervisor", "output"]);
  assert.equal(r.rounds, 2);
  assert.equal(r.approved, true);
  assert.equal(r.capped, false);
  assert.equal(r.final, "FINAL");
  assert.equal(r.steps[1].approved, false);
  assert.equal(r.steps[1].feedback, "faltou X");

  const workers = calls.filter((c) => c[0].content === "trabalhe");
  assert.doesNotMatch(workers[0][1].content, /faltou X/);
  assert.match(workers[1][1].content, /faltou X/);
  assert.match(workers[1][1].content, /ARTEFATO/, "o trabalhador vê o trabalho anterior");
});

test("runGraph para no teto de max_retries e entrega melhor esforço", async () => {
  const { nodes, edges } = loopGraph(2);
  let workers = 0;
  const call: CallModel = async (messages) => {
    if (messages[0].content === "julgue") return { text: '{"aprovado": false, "feedback": "ainda não"}' };
    if (messages[0].content === "trabalhe") workers += 1;
    return { text: messages[0].content === "entregue" ? "MELHOR ESFORÇO" : "ARTEFATO" };
  };

  const r = await runGraph(nodes, edges, "pedido", CFG, call);
  assert.equal(workers, 2);
  assert.equal(r.rounds, 2);
  assert.equal(r.capped, true);
  assert.equal(r.approved, true, "teto estourado ainda entrega");
  assert.equal(r.final, "MELHOR ESFORÇO");
  assert.deepEqual(r.steps.map((s) => s.kind), ["worker", "supervisor", "worker", "supervisor", "output"]);
});

test("parseVerdict aceita JSON, cerca de código e texto solto", () => {
  assert.deepEqual(parseVerdict('{"aprovado": true, "feedback": ""}'), { approved: true, feedback: "" });
  assert.deepEqual(parseVerdict('```json\n{"aprovado": false, "feedback": "falta X"}\n```'), { approved: false, feedback: "falta X" });
  assert.deepEqual(parseVerdict("Reprovado: falta Y"), { approved: false, feedback: "Reprovado: falta Y" });
  assert.deepEqual(parseVerdict("Aprovado sem ressalvas."), { approved: true, feedback: "" });
  assert.equal(parseVerdict("Não aprovado: corrija.").approved, false);
  assert.equal(parseVerdict('{"aprovado": "false"}').approved, false);
  assert.throws(() => parseVerdict("ARTEFATO"), /sem veredito reconhecível/);
});

test("badOrigin compara a origem com o header Host", () => {
  const req = (origin: string | null, host: string) => {
    const headers = new Headers({ host });
    if (origin) headers.set("origin", origin);
    return new Request("http://127.0.0.1:3000/api/run", { headers });
  };
  assert.equal(badOrigin(req("http://127.0.0.1:3000", "127.0.0.1:3000")), false);
  assert.equal(badOrigin(req(null, "127.0.0.1:3000")), false, "sem Origin passa (curl/CLI)");
  assert.equal(badOrigin(req("http://localhost:3000", "127.0.0.1:3000")), true);
  assert.equal(badOrigin(req("http://evil.test", "127.0.0.1:3000")), true);
  assert.equal(badOrigin(req("http://evil.test", "")), true, "sem Host, nega");
});

test("toPython gera cliente HTTP real e supervisor ligado direto", () => {
  const { nodes, edges } = loopGraph(2);
  const py = toPython(nodes, edges);
  assert.match(py, /def call_llm\(system: str, user: str\) -> str:/);
  assert.match(py, /urllib\.request\.Request/);
  assert.match(py, /def _parse_veredito\(texto: str\) -> dict:/);
  assert.match(py, /\("supervisor_1", supervisor_1\)/);
  assert.doesNotMatch(py, /TODO|_check/, "nada de nó morto ou chamada por fazer");
  assert.match(py, /"input": "seu prompt aqui"/);
});

test("callOpenAI fala o protocolo /chat/completions", async () => {
  let seenAuth = "";
  let seenBody = "";
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      seenAuth = String(req.headers.authorization ?? "");
      seenBody = raw;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: "oi" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const reply = await callOpenAI(
      [{ role: "user", content: "x" }],
      { baseUrl: `http://127.0.0.1:${port}/v1/`, model: "m", apiKey: "k" },
    );
    assert.equal(reply.text, "oi");
    assert.equal(reply.usage?.total, 5);
    assert.equal(seenAuth, "Bearer k");
    const body = JSON.parse(seenBody) as { model: string; messages: { content: string }[] };
    assert.equal(body.model, "m");
    assert.equal(body.messages[0].content, "x");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
