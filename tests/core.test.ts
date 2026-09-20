import test from "node:test";
import assert from "node:assert/strict";
import type { Edge } from "@xyflow/react";
import { defaultData, nextLabel, type PieceKind, type PieceNode } from "../lib/types";
import { countIssues, hasErrors, validateGraph } from "../lib/validate";
import { toJsonPayload, toPython } from "../lib/export";
import { graphSignature, type GraphPayload } from "../lib/persist";
import { edgeStyle, edgeTone } from "../lib/edges";
import { normalizeGraph } from "../lib/graph";
import { autoLayout } from "../lib/layout";

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
  assert.match(code, /add_conditional_edges\("supervisor_1_check", roteador, \{"aprovado": "entrega_1", "reprovado": "trabalhador_2"\}\)/);
  assert.match(code, /builder\.add_edge\("trabalhador_2", "supervisor_1_check"\)/);
  assert.match(code, /builder\.add_edge\("entrega_1", END\)/);
  assert.doesNotMatch(code, /"reprovado": "trabalhador_1"/, "loop não pode voltar ao primeiro trabalhador");
});

test("toPython sem arestas cai no fluxo linear", () => {
  const nodes = [N("i", "input", "Entrada 1"), N("w", "worker", "Trabalhador 1"), N("s", "supervisor", "Supervisor 1"), N("o", "output", "Entrega 1")];
  const code = tail(toPython(nodes, []));
  assert.match(code, /builder\.add_edge\("entrada_1", "trabalhador_1"\)/);
  assert.match(code, /builder\.add_edge\("trabalhador_1", "supervisor_1_check"\)/);
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
