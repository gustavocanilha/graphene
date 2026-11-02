# Graphene

Construtor local, no-code, de grafos de agentes de IA. Você desenha o fluxo no navegador — **Entrada**, **Trabalhador**, **Supervisor** e **Entrega** — executa o laço ali mesmo contra um endpoint OpenAI-compatible e exporta o resultado como grafo LangGraph executável, payload JSON, metaprompt Markdown ou Skill Hermes.

Roda 100% na sua máquina. Sem conta, sem telemetria, sem enviar seus dados para servidor nenhum. A execução usa o endpoint que você configurar; a chave fica no seu navegador.

---

## Sobre o projeto

O Graphene existe para montar, executar, testar e versionar o desenho de um laço de agentes antes de escrever código. Em vez de discutir o fluxo em texto, você arrasta as peças, liga as setas, roda o laço com um modelo real e só então exporta o grafo.

**Principais funcionalidades**

- **Editor visual** com quatro tipos de peça: Entrada, Trabalhador, Supervisor e Entrega. Arrastar da barra lateral, ligar pelas manoplas, duplicar com `Ctrl+D`.
- **Execução real no app**: o botão **Executar** chama o modelo em cada nó e mostra rodada por rodada o artefato do trabalhador, o veredito do supervisor e o feedback. Respeita o `max_retries` e, ao estourar o teto, entrega o melhor esforço. Funciona com qualquer endpoint OpenAI-compatible: OpenAI, OpenRouter, Groq, Ollama, LM Studio.
- **Laço Trabalhador → Supervisor** com teto de rodadas (`max_retries`) e texto de feedback. A aresta vermelha `reprovado/feedback` é o que devolve o trabalho para ser refeito.
- **Arestas coloridas por decisão**: verde no caminho aprovado, vermelho no reprovado. Só as arestas que saem do supervisor recebem cor.
- **Validação em tempo real** antes de exportar: grafo sem Entrada ou Entrega, peça desconectada, peça sem system prompt, supervisor com menos de duas saídas e supervisor duplicado.
- **Quatro formatos de exportação**, todos gerados a partir das arestas que você desenhou:
  - `grafo_langgraph.py` — grafo LangGraph executável de verdade: cada nó chama um endpoint OpenAI-compatible via `urllib` (sem dependência além de `langgraph`), com roteador, trava de `max_retries` e melhor esforço quando o teto estoura;
  - `grafo.json` — payload com nós, arestas, prompts e condição de roteamento;
  - `metaprompt.md` — metaprompt para um LLM orquestrar o fluxo;
  - `hermes_skill.yaml` — Skill Hermes pronta para `agent.load_skill_from_file`.
- **Salvamento automático** com debounce: grava em `~/.graphene/<nome>.graphene` somente quando o conteúdo muda de verdade.
- **Meus grafos**: criar, abrir, salvar como, excluir e importar JSON, com confirmação em dois toques nas ações destrutivas.
- **Layout automático** (dagre) e enquadramento, para arrumar o desenho com um clique.
- **CLI própria**: `graphene` sobe o servidor, escolhe uma porta livre e abre o navegador.

**Como o fluxo funciona**

```
Entrada → Trabalhador → Supervisor ─┬─ aprovado ─────────→ Entrega
                                    └─ reprovado/feedback → Trabalhador
```

---

## Pré-requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| **Node.js** | 18.17 ou superior | rodar o app e o servidor Next.js |
| **Node.js** | 22 ou superior | rodar a suíte de testes (`npm test`) |
| **npm** | 9 ou superior | instalar dependências (vem junto com o Node) |
| **Git** | qualquer versão recente | clonar e atualizar o projeto |
| **Python** | 3.9 ou superior (opcional) | rodar o `grafo_langgraph.py` exportado (`pip install langgraph`) |

Para o editor e a execução no app, nada além de Node. Python só é necessário se você for rodar o grafo exportado. Não é necessário banco de dados nem Docker.

---

## Como baixar e instalar

```bash
# 1. Clone o repositório
git clone https://github.com/gustavocanilha/graphene.git
cd Graphene

# 2. Instale as dependências
npm install

# 3. (Opcional) Registre o comando graphene no PATH do sistema
npm link
```

O passo 3 é opcional. Sem ele, use `node bin/graphene.js` sempre que quiser iniciar. Com ele, basta digitar `graphene` de qualquer pasta.

---

## Como executar

### Opção 1 — CLI (recomendada)

```bash
graphene
```

A CLI cria `~/.graphene` se não existir, procura a primeira porta livre a partir da 3000, sobe o servidor em `127.0.0.1` e abre o navegador na URL correta. Se a 3000 estiver ocupada, ela avisa e usa a próxima:

```
[graphene] porta 3000 ocupada, usando 3001.
[graphene] estado em C:\Users\voce\.graphene
[graphene] http://localhost:3001  (host 127.0.0.1)
```

Para encerrar, `Ctrl+C` no terminal. O servidor é derrubado junto.

Sem `npm link`: `node bin/graphene.js`.

**Flags da CLI**

| Flag | O que faz |
| --- | --- |
| `--port N` | porta preferida (padrão 3000, ou a variável `PORT`) |
| `--host H` | interface de escuta (padrão `127.0.0.1`, só a máquina local) |
| `--no-open` | sobe sem abrir o navegador |
| `--build` | roda o build de produção antes de subir |
| `--dry-run` | só mostra a porta que seria usada e sai |
| `--help` | ajuda |

### Opção 2 — scripts do npm

```bash
npm run dev              # servidor de desenvolvimento com hot reload
npm run build && npm start   # build de produção e servidor otimizado
```

Depois abra a URL que o terminal imprimir (por padrão `http://localhost:3000`).

### Executando um grafo (dentro do app)

Com um grafo válido no canvas, clique em **Executar** na barra superior. Na janela:

1. **Endpoint**: qualquer `/v1` OpenAI-compatible.
   - OpenAI: `https://api.openai.com/v1`, modelo `gpt-4o-mini`
   - OpenRouter: `https://openrouter.ai/api/v1`, modelo no formato `autor/modelo`
   - Ollama: `http://localhost:11434/v1`, modelo `llama3.1`, chave vazia
   - LM Studio: `http://localhost:1234/v1`, chave vazia
2. **Modelo** e **chave** (opcional). A chave fica no `localStorage` deste navegador e só é enviada ao endpoint que você configurou.
3. **Entrada**: o texto que a peça Entrada recebe.
4. **Executar**: cada nó faz uma chamada real. A trilha mostra artefato, veredito e feedback de cada rodada; ao bater `max_retries`, a entrega vira melhor esforço.

O custo é o do seu provedor. O app não grava a chave em disco nem no arquivo do grafo.

### Rodando o grafo exportado

O `grafo_langgraph.py` usa só `langgraph` + biblioteca padrão:

```bash
pip install langgraph
export OPENAI_API_KEY=...                          # PowerShell: $env:OPENAI_API_KEY="..."
export OPENAI_BASE_URL=http://localhost:11434/v1    # opcional
export OPENAI_MODEL=llama3.1                        # opcional
python grafo_langgraph.py
```

Sem `OPENAI_BASE_URL`, ele usa a OpenAI. O estado (`feedback`, `tentativas`) e a trava de `max_retries` são os mesmos do laço executado no app.

---

## Como atualizar

```bash
cd Graphene
git pull                       # traz as novidades
npm install                    # atualiza dependências que mudaram
npm run build                  # se você roda em modo produção
```

Se estiver com o servidor aberto, pare com `Ctrl+C` antes de atualizar e suba de novo depois. Seus grafos ficam em `~/.graphene/`, fora do repositório, então atualizar nunca mexe neles.

---

## Estrutura de pastas

```
Graphene/
├── app/
│   ├── api/graphs/route.ts     API de leitura, gravação e exclusão dos grafos
│   ├── api/run/route.ts        API de execução: valida, chama o endpoint e devolve a trilha
│   ├── globals.css             Estilos globais e ajustes do React Flow
│   ├── icon.svg                Ícone do app (favicon)
│   ├── layout.tsx              Layout raiz, metadados e fonte
│   └── page.tsx                Editor: estado, atalhos, autosave e janelas
├── bin/
│   └── graphene.js             CLI: porta livre, sobe o Next, abre o navegador
├── components/
│   ├── EdgeView.tsx            Aresta com rótulo em pill e cor por decisão
│   ├── ExportModal.tsx         Janela dos quatro formatos de exportação
│   ├── GraphCanvas.tsx         Canvas React Flow
│   ├── GraphsModal.tsx         Gerenciador "Meus grafos"
│   ├── LeftSidebar.tsx         Barra de peças (arrastar ou clicar)
│   ├── RightPanel.tsx          Edição da peça selecionada
│   ├── RunModal.tsx            Janela de execução: endpoint, entrada e trilha
│   ├── Topbar.tsx              Título, estado do autosave e ações
│   ├── ValidationBar.tsx       Painel de validação e controles de zoom
│   └── nodes.tsx               Aparência das peças no canvas
├── lib/
│   ├── edges.ts                Regra de cor das arestas (função pura)
│   ├── export.ts               Geradores Python, JSON, Markdown e Hermes
│   ├── graph.ts                Normalização de grafo vindo de fora
│   ├── http.ts                 Checagem de origem (CSRF) compartilhada pelas APIs
│   ├── layout.ts               Layout automático com dagre
│   ├── persist.ts              Cliente da API e assinatura do autosave
│   ├── run.ts                  Laço de execução e cliente OpenAI-compatible
│   ├── types.ts                Tipos, nomes padrão e numeração das peças
│   └── validate.ts             Checagens antes de exportar
├── public/logo.svg             Marca do app (desenho próprio, SVG)
├── tests/core.test.ts          Testes das regras puras (node:test)
├── README.md
├── next.config.mjs
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── tsconfig.test.json
```

---

## Atalhos de teclado

| Tecla | Ação |
| --- | --- |
| `Ctrl+S` | Salvar agora |
| `Ctrl+Shift+E` | Abrir a janela de exportação |
| `Ctrl+D` | Duplicar a peça selecionada (já com nome numerado) |
| `Del` / `Backspace` | Apagar peças ou arestas selecionadas |
| `Setas` | Mover a peça 8px (`Shift` move 24px) |
| `Esc` | Fechar menu de conexão e janelas |

---

## Verificação

```bash
npm run typecheck    # TypeScript sem emitir arquivos
npm run lint         # ESLint com as regras do Next
npm test             # testes das regras puras (exige Node 22+)
```

A suíte cobre numeração de peças, validação pré-exportação, fiação do Python gerado, assinatura do autosave, normalização de grafo importado, a regra de cor das arestas, o laço de execução (feedback, teto de retries e melhor esforço), o parser de veredito e o protocolo OpenAI-compatible (contra um servidor stub local).

---

## Avisos de segurança e permissões

- **Operação local.** A CLI sobe o servidor em `127.0.0.1`, ou seja, acessível apenas nesta máquina — outros dispositivos da rede não alcançam. Se você usar `npm run dev` ou `npm start` direto, o Next escuta em todas as interfaces por padrão; para restringir, use `next dev -H 127.0.0.1` ou a CLI.
- **As APIs não têm autenticação, por decisão de projeto.** Elas existem para servir o editor na mesma máquina. Em compensação, validam a origem da requisição (CSRF), limitam tamanho de payload, sanitizam o nome do arquivo (não há como escapar de `~/.graphene` por `..`) e gravam de forma atômica. A execução também recusa grafo inválido e endpoint que não seja `http`/`https`.
- **Seus dados ficam com você.** Os grafos são arquivos JSON em `~/.graphene/`. Não há telemetria nem chamada a nenhum serviço do projeto. Na execução, a entrada e os artefatos vão para o endpoint que você configurou — como em qualquer chamada de LLM.
- **Requisições externas:** só o endpoint configurado por você (execução) e a fonte Inter do Google Fonts (layout). Sem internet, o app cai para a fonte do sistema e continua funcionando; a execução depende do endpoint escolhido.
- **Chave do provedor:** fica no `localStorage` do navegador e é enviada por POST ao servidor local, que a repassa apenas ao endpoint configurado. O Graphene não grava a chave em disco nem em log. O Python exportado lê `OPENAI_API_KEY` do ambiente.
- **Ações destrutivas pedem confirmação.** "Limpar" (canvas) e "Excluir" (grafo salvo) exigem um segundo clique; o botão muda para "Tem certeza?" antes de agir.
- **Nenhuma credencial no repositório.** Não há chave, token ou senha no código. O app lê `PORT` na CLI; o Python exportado lê `OPENAI_API_KEY`, `OPENAI_BASE_URL` e `OPENAI_MODEL` do ambiente. Arquivos `.env*` estão no `.gitignore`.
- **Pastas de auditoria interna** (findings, provas de conceito e base de conhecimento) ficam em `workspace/`, ignorada pelo Git de propósito: é material de trabalho local, não parte do produto.
- **Modo de leitura:** o app não lê nem escreve fora de `~/.graphene/` e do cache `.next/` do próprio projeto. Não há suporte a diretórios de rede.

---

## Licença

[MIT](LICENSE) © 2026 Gustavo Canilha.

Em resumo: você pode usar, copiar, modificar, publicar, distribuir e vender este software, desde que mantenha o aviso de copyright e a licença junto. O software é fornecido "como está", sem garantias.
