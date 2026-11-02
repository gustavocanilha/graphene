"use client";
import { useEffect, useMemo, useState } from "react";
import type { Edge } from "@xyflow/react";
import { KIND_LABEL, type PieceNode } from "@/lib/types";
import { hasErrors, validateGraph } from "@/lib/validate";
import type { RunResult, RunStep } from "@/lib/run";

type Config = { baseUrl: string; model: string; apiKey: string };
const STORE = "graphene:run.config";
const DEFAULTS: Config = { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "" };

const KIND_TONE: Record<string, string> = {
  input: "bg-primary/10 text-primary",
  worker: "bg-wash text-ink-2",
  supervisor: "bg-warn/10 text-warn",
  output: "bg-ok/10 text-ok-text",
};

function StepCard({ step }: { step: RunStep }) {
  const supervisor = step.kind === "supervisor";
  const tone = supervisor
    ? step.approved ? "border-ok/40 bg-ok/5" : "border-danger/30 bg-danger/5"
    : "border-hairline bg-surface";
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_TONE[step.kind] ?? "bg-wash text-ink-2"}`}>
          {KIND_LABEL[step.kind]}
        </span>
        <span className="text-[12px] font-medium text-ink truncate">{step.label}</span>
        <span className="text-[11px] text-muted">rodada {step.round}</span>
        {supervisor && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${step.approved ? "bg-ok/10 text-ok-text" : "bg-danger/10 text-danger"}`}>
            {step.approved ? "aprovado" : "reprovado"}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[11px] text-muted">
          {step.ms} ms{step.usage ? ` · ${step.usage.total} tokens` : ""}
        </span>
      </div>
      <pre className="text-[12px] font-mono leading-5 text-ink-2 whitespace-pre-wrap max-h-64 overflow-auto">{step.text}</pre>
    </div>
  );
}

/** Executa o grafo de verdade: config do endpoint, input e a trilha de cada rodada. */
export default function RunModal({ nodes, edges, title, onClose }: {
  nodes: PieceNode[]; edges: Edge[]; title: string; onClose: () => void;
}) {
  const [config, setConfig] = useState<Config>(DEFAULTS);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setConfig({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Config>) });
    } catch { /* configuração local corrompida: segue no padrão */ }
  }, []);

  const saveConfig = () => {
    try { localStorage.setItem(STORE, JSON.stringify(config)); } catch { /* quota cheia */ }
  };

  const issues = useMemo(() => validateGraph(nodes, edges), [nodes, edges]);
  const blocked = useMemo(() => issues.find((i) => i.level === "error")?.text ?? null, [issues]);
  const disabled = running || !!blocked || !input.trim() || !config.baseUrl.trim() || !config.model.trim();

  const run = async () => {
    if (disabled) return;
    saveConfig();
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges, input, config }),
      });
      const data = (await res.json().catch(() => null)) as (RunResult & { error?: string }) | null;
      if (!res.ok) throw new Error(data?.error ?? `Falha ${res.status}`);
      if (!data) throw new Error("Resposta vazia do servidor.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar.");
    } finally {
      setRunning(false);
    }
  };

  const field = "w-full text-[13px] bg-surface border border-hairline rounded-md px-2.5 py-1.5 text-ink outline-none focus:border-primary";
  const label = "block text-[11px] font-semibold text-muted";

  return (
    <div className="fixed inset-0 z-50 bg-black/20 grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Executar grafo"
        className="w-full max-w-5xl max-h-[88vh] bg-surface rounded-xl border border-hairline shadow-pop overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
          <h2 className="text-[15px] font-semibold text-ink">Executar grafo</h2>
          <span className="text-[12px] text-muted truncate">{title}</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-[13px] border border-hairline rounded-md px-3 py-1.5 hover:bg-wash">Fechar</button>
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[300px_1fr]">
          <div className="border-r border-hairline p-4 space-y-3 overflow-auto">
            <label className="block space-y-1">
              <span className={label}>ENDPOINT (OpenAI-COMPATIBLE)</span>
              <input className={field} value={config.baseUrl} spellCheck={false} autoComplete="off"
                aria-label="Endpoint OpenAI-compatible"
                onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} onBlur={saveConfig}
                placeholder="https://api.openai.com/v1" />
            </label>
            <label className="block space-y-1">
              <span className={label}>MODELO</span>
              <input className={field} value={config.model} spellCheck={false} autoComplete="off"
                aria-label="Modelo"
                onChange={(e) => setConfig({ ...config, model: e.target.value })} onBlur={saveConfig}
                placeholder="gpt-4o-mini" />
            </label>
            <label className="block space-y-1">
              <span className={label}>CHAVE (OPCIONAL)</span>
              <input className={field} type="password" value={config.apiKey} autoComplete="off"
                aria-label="Chave do provedor"
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} onBlur={saveConfig}
                placeholder="sk-… (vazio em Ollama/LM Studio)" />
            </label>
            <p className="text-[11px] text-muted leading-4">
              Ex.: Ollama em <code>http://localhost:11434/v1</code>. A chave fica só neste navegador e vai apenas para o endpoint configurado.
            </p>

            <label className="block space-y-1">
              <span className={label}>ENTRADA</span>
              <textarea className={`${field} resize-y`} rows={6} value={input}
                aria-label="Entrada do grafo"
                onChange={(e) => setInput(e.target.value)}
                placeholder="Cole aqui o pedido que a Entrada vai receber." />
            </label>

            {blocked && <p className="text-[12px] text-danger">{blocked}</p>}
            {error && <p role="alert" className="text-[12px] text-danger break-words">{error}</p>}

            <button onClick={run} disabled={disabled} aria-busy={running}
              className="w-full text-[13px] font-medium bg-primary hover:bg-primary-press text-white rounded-md px-4 py-2 disabled:opacity-50">
              {running ? "Executando…" : "Executar"}
            </button>
            <p className="text-[11px] text-muted leading-4">
              Cada nó faz uma chamada real ao modelo. O custo é o do seu provedor.
            </p>
          </div>

          <div className="p-4 overflow-auto bg-canvas">
            {!result && !running && (
              <p className="text-[13px] text-muted">
                Configure o endpoint e rode. O laço trabalhador→supervisor aparece aqui rodada por rodada, com veredito e feedback.
              </p>
            )}
            {running && <p role="status" className="text-[13px] text-ink-2">Executando… a primeira resposta pode levar alguns segundos.</p>}
            {result && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className={`px-2 py-1 rounded-full font-medium ${
                    result.capped ? "bg-warn/10 text-warn" : result.approved ? "bg-ok/10 text-ok-text" : "bg-danger/10 text-danger"
                  }`}>
                    {result.capped ? "Teto atingido — melhor esforço" : result.approved ? "Aprovado" : "Reprovado"}
                  </span>
                  <span className="text-muted">{result.rounds} rodada(s)</span>
                  {result.usage.total > 0 && <span className="text-muted">{result.usage.total} tokens</span>}
                </div>
                {result.steps.map((s, i) => <StepCard key={`${s.nodeId}-${i}`} step={s} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
