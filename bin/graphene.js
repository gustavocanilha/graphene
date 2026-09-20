#!/usr/bin/env node
// bin/graphene.js — CLI local: garante ~/.graphene, escolhe porta livre, sobe o Next e abre o navegador.
// Sem npx e sem shell: nenhum cmd.exe piscando e o servidor morre junto com este processo.
const { spawn, spawnSync } = require("child_process");
const { existsSync, mkdirSync } = require("fs");
const net = require("net");
const { homedir } = require("os");
const { join } = require("path");

const root = join(__dirname, "..");
const args = process.argv.slice(2);
const valueOf = (name) => {
  const inline = args.find((a) => a.startsWith(name + "="));
  if (inline) return inline.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--help") || args.includes("-h")) {
  console.log([
    "Graphene — construtor local de grafos de agentes",
    "",
    "Uso: graphene [opções]",
    "",
    "  --port N        porta preferida (padrão 3000, ou a variável PORT)",
    "  --host H        interface (padrão 127.0.0.1, só a máquina local)",
    "  --no-open       não abre o navegador",
    "  --build         roda o build de produção antes de subir",
    "  --dry-run       só mostra a porta escolhida e sai",
    "  --help          mostra esta ajuda",
    "",
    "Se a porta preferida estiver ocupada, a CLI sobe na próxima livre.",
    "Grafos ficam em ~/.graphene",
  ].join("\n"));
  process.exit(0);
}

/** Alguém já responde nessa porta em loopback? Cobre também quem escuta em 0.0.0.0. */
function inUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const done = (value) => { sock.destroy(); resolve(value); };
    sock.setTimeout(300);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

/** Porta realmente livre: ninguém responde e o bind de loopback funciona (não abre exceção no firewall). */
async function isFree(port) {
  if (await inUse(port)) return false;
  return await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

/** Primeira porta livre da faixa. Devolve null quando não acha. */
async function pickPort(preferred) {
  for (let p = preferred; p <= preferred + 20; p++) {
    // eslint-disable-next-line no-await-in-loop -- sondagem sequencial: cada porta depende da anterior
    if (await isFree(p)) return p;
  }
  return null;
}

/** Abre o navegador sem deixar console piscando; falhar aqui não é erro fatal. */
function openBrowser(url) {
  const spec = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
      : ["xdg-open", [url]];
  try {
    const opener = spawn(spec[0], spec[1], { stdio: "ignore", detached: true, windowsHide: true });
    opener.on("error", () => {});
    opener.unref();
  } catch { /* sem navegador disponível: segue servindo */ }
}

let server = null;
let stopping = false;

/** Windows não tem sinal de verdade: mata a árvore inteira para não deixar worker zumbi. */
function stopServer() {
  if (stopping || !server || server.exitCode !== null) return;
  stopping = true;
  if (process.platform === "win32" && server.pid) {
    try { spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { /* segue para o kill simples */ }
  }
  try { server.kill(); } catch { /* já morreu */ }
}

function start(mode, extra) {
  server = spawn(process.execPath, [binPath, mode, ...extra], { cwd: root, stdio: "inherit", windowsHide: true });
  server.on("error", (err) => {
    console.error("[graphene] falha ao iniciar:", err.message);
    process.exit(1);
  });
  server.on("exit", (code) => process.exit(code ?? 0));
}

let binPath = null;

(async () => {
  const preferred = Number(valueOf("--port") || process.env.PORT || 3000);
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65535) {
    console.error("[graphene] porta inválida: " + valueOf("--port"));
    process.exit(1);
  }

  const dir = join(homedir(), ".graphene");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  try {
    binPath = require.resolve("next/dist/bin/next");
  } catch {
    console.error("[graphene] Next não encontrado. Rode: npm install");
    process.exit(1);
  }

  const port = await pickPort(preferred);
  if (port === null) {
    console.error("[graphene] nenhuma porta livre entre " + preferred + " e " + (preferred + 20) + ".");
    process.exit(1);
  }
  if (port !== preferred) console.log("[graphene] porta " + preferred + " ocupada, usando " + port + ".");

  const host = String(valueOf("--host") || "127.0.0.1");
  const url = "http://localhost:" + port;
  console.log("[graphene] estado em " + dir);
  console.log("[graphene] " + url + "  (host " + host + ")");

  if (args.includes("--dry-run")) {
    console.log("[graphene] dry-run: nada foi iniciado.");
    process.exit(0);
  }

  const open = !args.includes("--no-open");
  const hasBuild = existsSync(join(root, ".next", "BUILD_ID"));
  const nextArgs = ["-p", String(port), "-H", host];

  if (args.includes("--build")) {
    const build = spawn(process.execPath, [binPath, "build"], { cwd: root, stdio: "inherit", windowsHide: true });
    build.on("exit", (code) => {
      if (code !== 0) process.exit(code ?? 1);
      if (open) setTimeout(() => openBrowser(url), 1800);
      start("start", nextArgs);
    });
  } else {
    if (open) setTimeout(() => openBrowser(url), 1800);
    start(hasBuild ? "start" : "dev", nextArgs);
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopServer();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
  process.on("exit", stopServer);
})();
