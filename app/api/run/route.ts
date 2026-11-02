import { NextResponse } from "next/server";
import { normalizeGraph } from "@/lib/graph";
import { badOrigin } from "@/lib/http";
import { runGraph, type RunConfig } from "@/lib/run";
import { hasErrors, validateGraph } from "@/lib/validate";

const MAX_ITEMS = 2000;
const MAX_INPUT = 100_000;

type Body = { nodes: unknown[]; edges: unknown[]; input: string; config: RunConfig };

/** Schema mínimo do pedido de execução. Config vem do navegador e nunca é gravada no servidor. */
function readBody(raw: unknown): Body | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.nodes) || b.nodes.length > MAX_ITEMS) return null;
  if (!Array.isArray(b.edges) || b.edges.length > MAX_ITEMS) return null;
  const input = typeof b.input === "string" ? b.input : "";
  if (!input.trim() || input.length > MAX_INPUT) return null;

  const c = (b.config ?? {}) as Record<string, unknown>;
  const baseUrl = typeof c.baseUrl === "string" ? c.baseUrl.trim() : "";
  const model = typeof c.model === "string" ? c.model.trim() : "";
  const apiKey = typeof c.apiKey === "string" ? c.apiKey : "";
  if (!baseUrl || baseUrl.length > 2000 || !model || model.length > 200) return null;
  if (apiKey.length > 5000) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { nodes: b.nodes, edges: b.edges, input, config: { baseUrl, model, apiKey } };
}

// POST {nodes, edges, input, config}: roda o laço e devolve a trilha completa.
export async function POST(req: Request) {
  if (badOrigin(req)) return NextResponse.json({ error: "origem negada" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = readBody(raw);
  if (!body) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  const { nodes, edges } = normalizeGraph(body);
  const issues = validateGraph(nodes, edges);
  if (hasErrors(issues)) {
    return NextResponse.json(
      { error: issues.find((i) => i.level === "error")?.text ?? "grafo inválido" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await runGraph(nodes, edges, body.input, body.config));
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha na execução";
    console.error("[graphene] execução falhou:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
