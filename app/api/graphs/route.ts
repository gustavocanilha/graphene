import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { normalizeGraph } from "@/lib/graph";

const DIR = join(homedir(), ".graphene");
const MAX_NAME = 120;
const MAX_ITEMS = 2000;

async function ensure() {
  await fs.mkdir(DIR, { recursive: true });
}

/** Nome -> arquivo dentro de ~/.graphene. A limpeza impede sair do diretório. */
const file = (name: string) => join(DIR, `${name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, MAX_NAME) || "default"}.graphene`);

// CSRF: browsers enviam Origin em POST/DELETE; mesma origem tem host igual ao Host.
function badOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

type Body = { name: string; title: string; nodes: unknown[]; edges: unknown[] };

/** Schema mínimo do que o Editor envia. Devolve null quando não dá para confiar. */
function readBody(body: unknown): Body | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || b.title.length > 5000) return null;
  if (!Array.isArray(b.nodes) || b.nodes.length > MAX_ITEMS) return null;
  if (!Array.isArray(b.edges) || b.edges.length > MAX_ITEMS) return null;
  const name = String(b.name ?? "default").trim();
  if (!name || name.length > MAX_NAME) return null;
  return { name, title: b.title, nodes: b.nodes, edges: b.edges };
}

let tmpSeq = 0;

/** No Windows o rename pode falhar por lock momentâneo de antivírus/indexador: tenta de novo antes de desistir. */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!transient || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
}

/**
 * Grava em temporário exclusivo e renomeia. Rename é atômico, então queda no meio nunca deixa JSON
 * pela metade, e o nome exclusivo evita que duas abas gravando o mesmo grafo colidam no temporário.
 */
async function writeAtomic(target: string, content: string): Promise<void> {
  tmpSeq += 1;
  const tmp = `${target}.${process.pid}.${tmpSeq}.tmp`;
  try {
    await fs.writeFile(tmp, content, "utf-8");
    await renameWithRetry(tmp, target);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

// GET: lista grafos. GET?id=x: carrega um. POST {name,nodes,edges,title}: salva. DELETE?id=x: apaga.
export async function GET(req: Request) {
  await ensure();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    try {
      const parsed = JSON.parse(await fs.readFile(file(id), "utf-8")) as Record<string, unknown>;
      // Normaliza na leitura: arquivo editado na mão não derruba o canvas.
      const { nodes, edges } = normalizeGraph(parsed);
      return NextResponse.json({
        name: String(parsed.name ?? id),
        title: String(parsed.title ?? id),
        nodes, edges,
        savedAt: parsed.savedAt ?? null,
      });
    } catch {
      return NextResponse.json({ error: "não encontrado" }, { status: 404 });
    }
  }
  const names = (await fs.readdir(DIR)).filter((f) => f.endsWith(".graphene")).map((f) => f.replace(/\.graphene$/, ""));
  return NextResponse.json({ dir: DIR, graphs: names });
}

export async function POST(req: Request) {
  await ensure();
  if (badOrigin(req)) return NextResponse.json({ error: "origem negada" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = readBody(raw);
  if (!body) return NextResponse.json({ error: "grafo inválido" }, { status: 400 });

  const { nodes, edges } = normalizeGraph(body);
  const doc = { name: body.name, title: body.title, nodes, edges, savedAt: new Date().toISOString() };
  try {
    await writeAtomic(file(body.name), JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error("[graphene] falha ao gravar", file(body.name), err);
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, name: body.name, nodes: nodes.length, edges: edges.length });
}

export async function DELETE(req: Request) {
  await ensure();
  if (badOrigin(req)) return NextResponse.json({ error: "origem negada" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "sem id" }, { status: 400 });
  try {
    await fs.unlink(file(id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
}
