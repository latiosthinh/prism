# PRISM

> **Refract ideas into working software through AI pipelines.**

PRISM is a multi-provider AI development orchestration engine that transforms raw ideas into production-ready code through structured, gated pipelines. It connects 30+ AI providers into a unified system where every step is reviewable, every decision is logged, and every artifact is source-controlled.

[![CI](https://github.com/latiosthinh/prism/actions/workflows/ci.yml/badge.svg)](https://github.com/latiosthinh/prism/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Providers](https://img.shields.io/badge/providers-30+-purple)]()

---

## ✨ What Makes PRISM Different

**Most AI tools give you a chat.** PRISM gives you a **pipeline** — a structured, auditable, replayable SDLC that runs through specialized AI agents.

| Feature | Traditional AI Tools | PRISM |
|---------|---------------------|-------|
| Workflow | Freeform chat | Structured DAG pipeline |
| Providers | Single backend | 30+ providers simultaneously |
| Review | Manual | Human-in-the-loop gates |
| Artifacts | Lost in chat | Markdown files, git-tracked |
| Reproducibility | None | Replay any run, resume from any step |
| Audit Trail | None | Append-only decision log + SHA-256 |
| Cost Tracking | Hidden | Per-step token/cost breakdown |
| Budget Control | None | Hard limits with pre-flight estimation |

---

## 🎯 Core Concepts

### Pipeline as Code

Define your AI workflow as YAML. Each step is a specialized agent with dependencies, gates, and retry logic.

```yaml
name: feature-build
steps:
  - id: design
    agent: architect
    backend: pi
    provider: anthropic
    model: claude-sonnet-4-20250514
    
  - id: implement
    agent: executor
    backend: cursor
    depends_on: [design]
    
  - id: review
    agent: critic
    backend: anthropic
    depends_on: [implement]
    gate: true
```

### Multi-Backend Architecture

Run different steps with different AI providers. Mix Cursor SDK, Pi SDK (30+ providers), and direct Anthropic API in a single pipeline.

```
┌─────────────────────────────────────────────────────────┐
│                    PRISM Pipeline                        │
│                                                          │
│  Step 1: Design ──→ Step 2: Implement ──→ Step 3: Review│
│     (Pi SDK)           (Cursor SDK)         (Anthropic)  │
│     Anthropic          composer-2           Claude Opus  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Artifact-Driven Development

Every agent writes to Markdown files. Code goes in source files. Artifacts are the source of truth — diffable, reviewable, and git-friendly.

```
.PRISM/runs/<run-id>/
├── state.json              # Full run state
├── steps/                  # Per-step artifacts
│   ├── <step-id>/
│   │   ├── latest.md
│   │   └── archive/
│   │       └── rev-1.md
├── decisions.jsonl         # Append-only audit log
└── events.jsonl            # Append-only event log (replay)
```

---

## 🚀 Quick Start

### Install

```bash
git clone https://github.com/latiosthinh/prism.git
cd prism
npm install
npm run build
```

### Option A: VS Code Extension

1. Open the workspace in VS Code
2. Set your AI provider (API keys are stored securely in VS Code SecretStorage):
   ```json
   {
     "prism.backend": "pi",
     "prism.piProvider": "anthropic",
     "prism.piModel": "claude-sonnet-4-20250514",
     "prism.piApiKey": "sk-ant-..."
   }
   ```
3. Open Command Palette → `PRISM: Open Pipeline`
4. Select a template or create custom
5. Enter your idea and watch the pipeline execute

### Option B: PRISM CLI

```bash
# Interactive REPL
npx @prism/cli --workspace /path/to/project

# One-shot commands
npx @prism/cli --list-pipelines
npx @prism/cli --run feature-build --idea "Add dark mode"
npx @prism/cli --dry-run code-review
npx @prism/cli --status
```

See the [CLI section](#-prism-cli) below for full details.

---

## 🏗️ Architecture

### Three-Layer Design

```
┌──────────────────────────────────────────────────────┐
│                  VS Code Extension                    │
│  ┌────────────────────────────────────────────────┐  │
│  │              React Panel UI                     │  │
│  │  DAG Canvas • Live Stream • Decision Log       │  │
│  │  Timeline • Cost Breakdown • Audit View        │  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │              Engine Bridge                      │  │
│  │  Pipeline Loader • State Machine • Orchestrator│  │
│  │  Audit Watcher (fs.watch + 150ms debounce)     │  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │              Step Runners                       │  │
│  │  ┌──────────┬──────────┬────────────────────┐  │  │
│  │  │ Cursor   │   Pi     │   Anthropic        │  │  │
│  │  │ SDK      │   SDK    │   SDK              │  │  │
│  │  └──────────┴──────────┴────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │              Observability Layer                │  │
│  │  Token Tracking • Budget Enforcement           │  │
│  │  Audit Log (decisions.jsonl) • Export (MD/CSV) │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
  prism-sdk/              # @prism/sdk - Unified AI runtime
    src/
      agent.ts            # OpenCodeAgent with event streaming
      llm.ts              # Multi-provider LLM client
      tools.ts            # Tool definitions & validation
      types.ts            # TypeScript interfaces

  prism-cli/              # @prism/cli - Interactive CLI agent
    src/
      index.ts            # REPL entry point + one-shot commands
      cli-agent.ts        # PRISMCliAgent with pipeline tools
      cli-engine.ts       # Self-contained pipeline engine
      slash-commands.ts   # 16 built-in slash commands
      tools.ts            # 10 AI function-calling tools
      config.ts           # Config loader (.prismrc, env, flags)
      output.ts           # Terminal rendering

prism/                    # VS Code Extension
  src/
    engine/
      pipeline/           # YAML schema, loader, validator
      orchestrator/       # State machine, loop orchestration
      runner/
        step-runner.ts    # Cursor + Anthropic runners
        pi-sdk-runner.ts  # Pi SDK runner with tool execution
        step-executor.ts  # Extracted step execution (shared logic)
      agents/             # 12 built-in AI agents
      errors/             # Human-readable error messages
      audit/
        audit-writer.ts   # Append-only JSONL writer
        audit-events.ts   # Event type definitions
        exporters/
          markdown.ts     # Compliance report (MD)
          csv.ts          # Step-level CSV export
      telemetry.ts        # Token/cost tracking + COST_TABLE
    extension/
      engine-bridge.ts    # Multi-backend factory + AuditWatcher
      templates/          # Pipeline YAML templates
    panel/
      components/
        ObservabilityPanel.tsx  # Tabbed dashboard
        Timeline.tsx            # DAG timeline view
        CostBreakdown.tsx       # Cost by step/provider
        AuditLogView.tsx        # Event log viewer
        BudgetMeter.tsx         # Budget progress bar
      hooks/
        useExtensionState.ts    # Panel state + message protocol
  schemas/
    pipeline-schema.json  # JSON Schema for YAML validation
```

---

## 🤖 Built-In Agents

PRISM ships with 12 specialized AI agents:

| Agent | Role | Category |
|-------|------|----------|
| `idea-expander` | Turns raw ideas into product specs | Product |
| `requirements-engineer` | Testable functional requirements | Product |
| `architect` | System design, components, data flow | Technical |
| `task-generator` | Decomposes design into atomic tasks | Technical |
| `executor` | Implements tasks surgically | Technical |
| `critic` | Code review for correctness | Quality |
| `test-writer` | Test specifications | Quality |
| `reporter` | Final run summary | Product |
| `security-reviewer` | OWASP/STRIDE audit | Quality |
| `performance-reviewer` | Performance profiling | Quality |
| `docs-writer` | Documentation from code | Product |
| `migration-planner` | Safe, reversible migrations | Technical |

---

## 🌐 Supported Providers

Via PRISM SDK (wrapping pi-ai):

### Tier 1 — Full Support
- **Anthropic** — Claude Sonnet 4, Opus, Haiku
- **OpenAI** — GPT-4, GPT-5, o1, o3, Codex
- **Google** — Gemini 2.5 Flash/Pro

### Tier 2 — Production Ready
- **Mistral** — Mistral Large/Small
- **Groq** — Llama, Mixtral, Gemma
- **Cerebras** — Llama, Mixtral
- **xAI** — Grok
- **OpenRouter** — 100+ models
- **Together AI** — Various open models

### Tier 3 — Community Supported
- **DeepSeek**, **Cloudflare AI**, **MiniMax**, **Fireworks**, **GitHub Copilot**, **Amazon Bedrock**, **Vercel AI Gateway**, **ZAI**, **Kimi For Coding**, **Xiaomi MiMo**

---

## 📋 Pipeline Templates

PRISM includes 8 pre-built templates:

| Template | Use Case | Steps |
|----------|----------|-------|
| `default` | Full SDLC | 8 steps with loops |
| `feature-build` | Quick features | Design → Implement → Test |
| `code-review` | Audit code | Review → Report |
| `bug-fix` | Fix bugs | Investigate → Fix → Verify |
| `full-stack-feature` | End-to-end | 6 steps with security |
| `refactor` | Safe refactoring | Analyze → Plan → Refactor → Verify |
| `prd-to-prototype` | Idea to code | Brainstorm → Prototype |
| `blank` | Custom | Start from scratch |

---

## 💻 PRISM CLI

The CLI provides an interactive REPL with slash commands and AI-powered pipeline management.

### Interactive Mode

```
$ npx @prism/cli --workspace /path/to/project

  PRISM CLI v0.2 — Interactive Pipeline Agent
  Workspace: /path/to/project
  Backend:   pi / claude-sonnet-4-20250514
  Type /help for commands, or just start chatting.

> What pipelines do I have?
[AI calls list_pipelines tool, streams response]

> /pipeline-run feature-build --idea "Add dark mode toggle"
  ⟳ expand-idea: Expand Idea...
  ✓ expand-idea: approved
  ⟳ architect: Architect Plan...

> /exit
```

### Slash Commands

| Command | Description |
|---------|-------------|
| `/pipelines-list` | Table of all available pipelines |
| `/pipelines-create <template>` | Create a new pipeline from template |
| `/pipeline-run <name> [--idea "..."]` | Start a pipeline run |
| `/pipeline-status` | Show current run progress |
| `/pipeline-resume` | Resume last failed/paused run |
| `/pipeline-dry-run <name>` | Validate without AI calls |
| `/runs-list` | List past runs |
| `/runs-view <id>` | View run details + decisions |
| `/runs-artifact <run-id> <step-id>` | View step artifact output |
| `/agents-list` | Available agents (built-in + custom) |
| `/skills-list` | Available skills |
| `/settings` | Current configuration |
| `/backend <cursor|pi|anthropic>` | Switch AI backend |
| `/model <model>` | Switch AI model |
| `/help` | Show all commands |
| `/exit` | Quit |

### One-Shot Flags

```bash
npx @prism/cli --list-pipelines          # List all pipelines
npx @prism/cli --list-runs               # List all runs
npx @prism/cli --status                  # Show latest run status
npx @prism/cli --run feature-build       # Run a pipeline
npx @prism/cli --run feature-build --idea "Add dark mode"
npx @prism/cli --dry-run code-review     # Validate pipeline
```

### Configuration

Config sources (priority order):
1. CLI flags: `--backend pi --model claude-sonnet-4-20250514`
2. `.prismrc` JSON file in workspace or home directory
3. Environment variables: `PRISM_BACKEND`, `PRISM_PROVIDER`, `PRISM_MODEL`, `PRISM_PI_API_KEY`

### AI Agent Tools

The CLI agent has 10 function-calling tools so the AI can manage pipelines directly:

| Tool | Purpose |
|------|---------|
| `list_pipelines` | Get available pipelines |
| `create_pipeline` | Create from template |
| `run_pipeline` | Execute a pipeline |
| `get_run_status` | Check run progress |
| `list_runs` | Browse run history |
| `get_run_artifact` | Read step output |
| `list_agents` | See available agents |
| `list_skills` | See available skills |
| `read_file` | Read workspace files |
| `bash` | Execute shell commands (with allowedCommands) |

---

## 🔧 Configuration

### VS Code Settings

API keys are stored securely in VS Code's encrypted SecretStorage. Configure them via the PRISM Settings panel.

```json
{
  "prism.backend": "pi",
  "prism.piProvider": "anthropic",
  "prism.piModel": "claude-sonnet-4-20250514",
  "prism.gates.autoApprove": false,
  "prism.commandConfirmation": true,
  "prism.allowedCommands": ["ls", "cat", "grep", "find"]
}
```

> **Note:** `prism.apiKey` and `prism.piApiKey` are deprecated — keys are now stored in SecretStorage. `prism.autoApproveYolo` has been replaced by `prism.gates.autoApprove`.

### Per-Step Backend Override

```yaml
steps:
  - id: design
    backend: pi
    provider: openai
    model: gpt-4o
    
  - id: implement
    backend: cursor
    
  - id: security-review
    backend: anthropic
```

---

## 🧪 Using PRISM SDK

### LLM Client

```typescript
import { createLLMClient } from '@prism/sdk';

const client = createLLMClient({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  thinkingLevel: 'medium',
});

const context = {
  messages: [{ role: 'user', content: 'Design a REST API' }]
};

// Streaming
const stream = client.stream(context);
for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}
```

### Agent Runtime

```typescript
import { OpenCodeAgent } from '@prism/sdk';

const agent = new OpenCodeAgent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You are a senior software architect.',
  thinkingLevel: 'high',
});

// Real-time streaming
for await (const event of agent.stream('Build a web app')) {
  if (event.type === 'text_delta') {
    console.log(event.delta);
  }
  if (event.type === 'tool_call_start') {
    console.log(`Using ${event.toolName}...`);
  }
}
```

---

## 📊 Project Structure

```
prism/
├── packages/
│   ├── prism-sdk/              # @prism/sdk
│   │   ├── src/
│   │   │   ├── agent.ts        # OpenCodeAgent
│   │   │   ├── llm.ts          # LLM client
│   │   │   ├── tools.ts        # Tool framework
│   │   │   └── types.ts        # TypeScript types
│   │   ├── tests/
│   │   │   ├── agent.test.ts
│   │   │   └── llm.test.ts
│   │   └── package.json
│   │
│   └── prism-cli/              # @prism/cli
│       ├── src/
│       │   ├── index.ts        # REPL entry point
│       │   ├── cli-agent.ts    # AI agent with tools
│       │   ├── cli-engine.ts   # Pipeline engine
│       │   ├── slash-commands.ts # 16 slash commands
│       │   ├── tools.ts        # 10 AI function-calling tools
│       │   ├── config.ts       # Config loader
│       │   └── output.ts       # Terminal rendering
│       └── package.json
│
├── prism/                      # VS Code Extension
│   ├── src/
│   │   ├── engine/
│   │   │   ├── pipeline/       # Schema, loader, validator
│   │   │   ├── orchestrator/   # State machine, loops
│   │   │   ├── runner/         # Step runners
│   │   │   ├── agents/         # Built-in agents
│   │   │   ├── errors/         # Friendly error messages
│   │   │   └── artifacts/      # Skill loader
│   │   ├── extension/
│   │   │   ├── engine-bridge.ts
│   │   │   └── templates/      # YAML templates
│   │   └── panel/              # React UI
│   ├── schemas/
│   │   └── pipeline-schema.json # JSON Schema for YAML
│   ├── tests/
│   │   └── pi-sdk-runner.test.ts
│   └── package.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI: lint + test + build
│       └── release.yml         # Release: .vsix packaging
│
├── CONTRIBUTING.md             # Contributing guide
├── docs/
│   └── roadmap.md              # v0.1 → v1.0 roadmap
└── README.md
```

---

## 🛠️ Development

### Build

```bash
# Build SDK
npm run build --workspace=@prism/sdk

# Build CLI
npm run build --workspace=@prism/cli

# Build extension
npm run build --workspace=prism

# Or build everything
npm run build
```

### Test

```bash
npm test --workspace=@prism/sdk
npm test --workspace=prism
```

### Dev Mode

```bash
npm run dev --workspace=prism
```

### CI/CD

PRISM uses GitHub Actions for continuous integration:

- **CI** — runs lint, test, and build on every push and PR
- **Release** — packages `.vsix` artifact on version tag pushes

See `.github/workflows/` for details.

---

## 📜 Git History

Clean, atomic commits organized by phase:

```
# v0.2 — CLI
2bb4a19 feat(cli): interactive REPL with AI agent and pipeline execution
49d84c5 feat(cli): AI agent tools for pipeline function calling
64fbd67 feat(cli): slash command system with 16 built-in commands
0ab5baa feat(cli): engine integration layer for pipeline management
fa319b6 feat(cli): scaffold @prism/cli package with config and output modules

# v0.2 — Developer Experience
dc45c3f feat(dx): human-readable error messages with suggested actions
357ba36 feat(dx): prism init CLI command for scaffolding pipeline projects
6785141 feat(dx): PRISM YAML language support via JSON Schema

# v0.2 — Pipeline Engine
34bed39 feat(engine): artifact diff view at approval gates
09e8f2a feat(engine): full pipeline dry-run validation mode
5fd6879 feat(engine): step retry with exponential backoff
62e7bfd feat(engine): resume from any step checkpoint

# v0.2 — Docs + CI
5c376cc docs: add CONTRIBUTING.md, custom-agents.md, and providers.md
c9f2fb7 feat(ci): add GitHub Actions CI and release workflows

# v0.2 — Security
6d26b52 feat(security): enforce allowedCommands in pi-sdk bash tool
68766fa feat(security): migrate API keys to VS Code SecretStorage

# v0.3 — Observability
d34308d feat(observability): hook export commands to VS Code save dialogs
2293157 feat(observability): add AuditWatcher with fs.watch for live streaming
62d2fb1 feat(observability): wire ObservabilityPanel into Pipeline view
685a40e refactor(orchestrator): extract step execution into StepExecutor
1a9d6f4 feat(observability): System 6 — panel wiring
4852c0c feat(observability): System 5 — export formats
929c7ae feat(observability): System 4 — audit log (decisions.jsonl)
ae6c7c3 feat(observability): System 3 — timeline DAG view
6b31bcc feat(observability): System 2 — budget enforcement
```

---

## 🆕 What's New in v0.2

### Security & Credentials
- **SecretStorage migration** — API keys stored in VS Code's encrypted SecretStorage, not plain text
- **Command allowlist** — `bash` tool enforces `allowedCommands` with wildcard pattern support
- **`prism.gates.autoApprove`** — replaces `autoApproveYolo` with proper warning UI

### Pipeline Engine
- **Resume from any step** — restart failed/paused runs from any checkpoint
- **Retry with backoff** — configurable `retryDelayMs` and `retryBackoffMultiplier` per step
- **Full dry-run mode** — validates YAML schema, dependencies, agents, skills without AI calls
- **Artifact diff at gates** — see what changed before approving

### Developer Experience
- **YAML language support** — JSON Schema for autocomplete and validation in VS Code
- **`prism init` command** — scaffold a pipeline project with template picker
- **Human-readable errors** — categorized error messages with suggested actions

### CI/CD & Distribution
- **GitHub Actions CI** — lint + test + build on every PR
- **Automated releases** — `.vsix` artifacts on version tags
- **Marketplace metadata** — categories, keywords, repository links

### PRISM CLI (New!)
- **Interactive REPL** — chat with AI agent that has pipeline management tools
- **16 slash commands** — `/pipelines-list`, `/pipeline-run`, `/pipeline-resume`, etc.
- **One-shot flags** — `--run`, `--dry-run`, `--list-pipelines`, `--status`
- **Config sources** — `.prismrc`, env vars, CLI flags

---

## 🔍 Observability Systems

PRISM v0.3 adds comprehensive observability — track costs, enforce budgets, visualize timelines, audit decisions, and export compliance reports.

### System 1: Token & Cost Tracking

Every step records token usage and computed cost automatically.

```yaml
# Step state now includes:
{
  "tokensIn": 12450,
  "tokensOut": 3200,
  "tokensCachedIn": 8900,
  "costUsd": 0.0847,
  "provider": "anthropic",
  "startedAtMs": 1715500000000,
  "completedAtMs": 1715500045000
}
```

Built-in cost table covers all major providers (Anthropic, OpenAI, Google, Mistral, Groq, etc.). Costs are computed from token counts using current pricing.

### System 2: Budget Enforcement

Set a budget on any pipeline. PRISM estimates step costs before execution and aborts if the budget would be exceeded.

```yaml
name: feature-build
budget_usd: 5.00        # Hard limit — run aborts if exceeded
budget_warn_pct: 80     # Warning at 80% ($4.00)
```

- **Pre-flight estimation** — checks remaining budget before each step/group
- **Parallel group awareness** — estimates total cost of parallel steps before launching
- **Graceful abort** — throws `PrismBudgetError` with spent vs. budget details

### System 3: Timeline DAG View

Visual timeline showing step execution order, duration, and overlap.

```
Timeline
─────────────────────────────────────────────
design      [████████████████]  12.4s  $0.08
implement   [████████████████████████]  28.1s  $0.12
review      [████████]  6.2s  $0.05
```

- **Sequential mode** — steps shown in execution order
- **Parallel mode** — overlapping bars for concurrent steps
- **Color-coded status** — green (pass), red (fail), yellow (gate pending)

### System 4: Audit Log

Append-only `decisions.jsonl` file records every significant event in a run.

```jsonl
{"type":"run_start","runId":"abc-123","ts":1715500000000,"pipeline":"feature-build","stepCount":5,"budgetUsd":5.0}
{"type":"step_start","runId":"abc-123","ts":1715500001000,"stepId":"design","agent":"architect","model":"claude-sonnet-4-20250514"}
{"type":"step_done","runId":"abc-123","ts":1715500013400,"stepId":"design","tokensIn":12450,"tokensOut":3200,"costUsd":0.0847,"durationMs":12400}
{"type":"budget_warn","runId":"abc-123","ts":1715500050000,"spentUsd":4.12,"budgetUsd":5.0,"pct":82.4}
{"type":"run_done","runId":"abc-123","ts":1715500095000,"totalCost":4.87,"totalTokens":45200,"durationMs":95000,"exitStatus":"completed"}
```

- **Separate from replay log** — `decisions.jsonl` (audit) vs `events.jsonl` (replay)
- **SHA-256 integrity hash** — verify audit log hasn't been tampered with
- **Event taxonomy** — `run_start`, `run_done`, `step_start`, `step_done`, `step_failed`, `step_skipped`, `budget_warn`, `budget_exceeded`, `auto_review_pass`, `auto_review_fail`, `user_note`

### System 5: Export Formats

Export audit logs for compliance, billing, or post-mortem analysis.

**Markdown Report:**
```markdown
# PRISM Run Report

## Summary
| Field | Value |
|---|---|
| Run ID | `abc-123` |
| Pipeline | feature-build |
| Duration | 1m 35s |
| Total Cost | $4.870000 |
| Budget | $5.00 |
| Budget Consumed | 97.4% |
| Status | completed |

## Step Summary
| Step | Agent | Model | Duration | Tokens | Cost | Status |
|---|---|---|---|---|---|---|
| design | architect | claude-sonnet-4-20250514 | 12s | 15,650 | $0.084700 | done |
```

**CSV Export:**
```csv
run_id,pipeline,step_id,agent,model,provider,started_at_iso,completed_at_iso,duration_ms,tokens_in,tokens_out,tokens_cached,cost_usd,status,artifact_path
abc-123,feature-build,design,architect,claude-sonnet-4-20250514,anthropic,2026-05-12T03:00:01.000Z,2026-05-12T03:00:13.400Z,12400,12450,3200,8900,0.084700,done,.PRISM/runs/abc-123/steps/design/latest.md
```

- **VS Code save dialog** — choose filename and location
- **CLI export** — `prism export --format md` or `prism export --format csv`

### System 6: Observability Panel

Tabbed dashboard in the VS Code panel with live updates.

```
┌─────────────────────────────────────────────┐
│ [Timeline] [Cost] [Audit]     [Export MD]   │
├─────────────────────────────────────────────┤
│ Budget: ████████████░░░░  97.4% ($4.87/$5) │
├─────────────────────────────────────────────┤
│ Timeline:                                   │
│   design      [████████████]  12.4s  $0.08  │
│   implement   [██████████████████]  28.1s   │
│   review      [████████]  6.2s  $0.05       │
└─────────────────────────────────────────────┘
```

- **Live streaming** — `fs.watch` on `decisions.jsonl` with 150ms debounce
- **Three tabs** — Timeline (DAG view), Cost (breakdown by step/provider), Audit (event log)
- **Budget meter** — visual progress bar with warning colors
- **Export buttons** — one-click Markdown or CSV export

---

## 📖 Documentation

- [Contributing Guide](CONTRIBUTING.md) — dev setup, coding conventions, PR process
- [Custom Agents](prism/docs/custom-agents.md) — write and register your own agents
- [Providers](prism/docs/providers.md) — full provider capability matrix and configuration
- [Roadmap](docs/roadmap.md) — v0.1 → v1.0 planned features

---

## 🎯 Why PRISM?

1. **Multi-Provider** — Don't lock into one AI. Use the best model for each step.
2. **Structured** — No more lost context in chat. Every step produces artifacts.
3. **Auditable** — Every decision logged, every artifact tracked in git. Append-only audit trails with SHA-256 integrity.
4. **Reproducible** — Replay any run. Resume from any step. Retry with backoff.
5. **Extensible** — Custom agents, custom skills, custom pipelines.
6. **Open** — MIT licensed. No vendor lock-in. 30+ providers.
7. **CLI + IDE** — Use it in VS Code or from your terminal. Interactive REPL with slash commands.
8. **Secure** — API keys in encrypted SecretStorage. Command allowlist enforcement.
9. **Observable** — Track token costs, enforce budgets, visualize timelines, export compliance reports.

---

## 📄 License

MIT

---

## 🤝 Contributing

PRISM is open source and welcomes contributions. See our [Contributing Guide](CONTRIBUTING.md) for details.

---

> *"The best way to predict the future is to build it."* — PRISM refracts your ideas into reality.
