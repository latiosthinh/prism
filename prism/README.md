# 🛠️ AIDLC — AI Development Life Cycle

> **Driven by AI, Powered by Passion.**
> A pipeline engine for the SDLC, baked right into Cursor.

<p align="center">
  <em>Niteco AI Hackathon 2026 · Team <strong>Build &amp; Chill</strong></em>
</p>

---

## 🎯 What is this?

**AIDLC** (AI Development Life Cycle) is a Cursor / VS Code extension that turns the messy reality of "vibe-coding with an LLM" into a **structured, gated, replayable pipeline**.

You give it an idea. It runs that idea through a **DAG of specialised AI agents** — Idea Expander → Requirements Engineer → Architect → Task Generator → Executor → Critic → Test Writer → Reporter — each producing reviewable Markdown artifacts under `.aidlc/`. Every step is gated, every decision is logged, every loop is bounded.

Think of it as **"GitHub Actions, but for cognition."**

---

## ✨ Highlights

| | |
|---|---|
| 🧩 **Composable pipelines** | YAML-defined DAGs with `depends_on`, parallel execution, and loop groups |
| 🤖 **12 built-in agents** | Idea expander, requirements engineer, architect, executor, critic, security & perf reviewers, docs writer, migration planner… |
| 🔁 **Three loop modes** | `task` (per-item), `phase` (until reviewer passes), `cascade` (rejects propagate upstream) |
| 🚦 **Human-in-the-loop gates** | Approve / reject / retry every step, or flip on YOLO mode |
| 📜 **Artifacts as the source of truth** | Every agent writes a Markdown file with frontmatter — diffable, reviewable, git-friendly |
| 🎨 **Native React panel** | DAG canvas (`@xyflow/react`), live agent stream, decision log, runs history |
| 🧠 **Cursor SDK first** | Uses `@cursor/sdk` (`composer-2`) by default; falls back to Anthropic API |
| 🧪 **Auto-reviewer** | Structural + semantic + custom validators between every step |
| 🛡️ **Sandboxed commands** | Glob-allowlist + per-command confirmation for anything an agent shells out |

---

## 🏗️ Architecture

```
                    ┌─────────────────────────────────────┐
                    │        Cursor / VS Code             │
                    │                                     │
   src/extension.ts │  ┌──────────────┐   ┌────────────┐  │
   (host process)   │  │ engine-bridge│◀─▶│  Webview   │  │
                    │  │  (postMsg)   │   │ React + Tw │  │
                    │  └──────┬───────┘   └────────────┘  │
                    └─────────┼───────────────────────────┘
                              │
                ┌─────────────▼──────────────┐
                │       Engine (src/engine)  │
                │                            │
                │  ┌──────────────────────┐  │
                │  │  Pipeline Loader     │  │  YAML → Zod → typed DAG
                │  │  + Validator         │  │
                │  └──────────┬───────────┘  │
                │             │              │
                │  ┌──────────▼───────────┐  │
                │  │  Loop Orchestrator   │  │  topo-sort, gates, retries
                │  │  + State Machine     │  │
                │  └──────────┬───────────┘  │
                │             │              │
                │  ┌──────────▼───────────┐  │
                │  │  Step Runner         │  │  CursorSdk / Anthropic
                │  │  + Auto-Reviewer     │  │
                │  │  + Loop Manager      │  │
                │  │  + Cascade Rejector  │  │
                │  └──────────┬───────────┘  │
                │             │              │
                │  ┌──────────▼───────────┐  │
                │  │  Agent Registry      │  │  12 builtins + custom
                │  │  Skill Loader        │  │  reusable prompt skills
                │  └──────────────────────┘  │
                └────────────────────────────┘
                              │
                              ▼
                       .aidlc/ on disk
                ├── pipelines/    *.yaml
                ├── agents/       *.md  (custom agents)
                ├── skills/       *.md  (reusable rules)
                └── runs/         <run-id>/{state.json, artifacts/*.md}
```

### Key concepts

- **Pipeline** — a named DAG of steps (`PipelineDefinitionSchema`).
- **Step** — `{ id, agent, model, gate, artifact, depends_on, loop?, skills }`.
- **Agent** — a system prompt + role. 12 built-in, plus any you drop into `.aidlc/agents/`.
- **Skill** — a reusable Markdown snippet (rule, checklist, style guide) that gets injected into an agent's context.
- **Run** — a stateful execution of a pipeline. Each run is a folder under `.aidlc/runs/` with full state, decisions, and artifacts. Resumable.
- **Decision log** — every transition (`step_started`, `auto_review_fail`, `cascade_reject`, …) is appended, never overwritten.

---

## 🚀 Quick start

### Install from VSIX

```bash
code --install-extension aidlc-0.2.0.vsix
# or in Cursor:  Cmd/Ctrl-Shift-P → "Extensions: Install from VSIX…"
```

### Or build from source

```bash
git clone https://github.com/niteco/team-build-chill-repo.git
cd team-build-chill-repo
npm install
npm run build      # builds extension (tsup) + panel (vite)
npm run package    # produces aidlc-x.y.z.vsix
```

### Open the panel

`Cmd/Ctrl-Shift-P` → **AIDLC: Open Pipeline**

You'll land on the Pipelines tab. Pick a template, hit **Run**, type your idea, and watch agents go to work in real time on the DAG canvas.

---

## 🧪 Available commands

| Command | What it does |
|---|---|
| `AIDLC: Open Pipeline` | Open the main webview panel |
| `AIDLC: Start New Pipeline` | Create a pipeline from a template |
| `AIDLC: Run Pipeline` | Kick off a run on the active pipeline |
| `AIDLC: Approve / Reject Current Step` | Manual gate control |
| `AIDLC: Resume Run` | Pick up a paused run from disk |
| `AIDLC: Dry-Run Pipeline` | Validate the DAG without invoking any LLM |
| `AIDLC: Show Decision Log` | Open the append-only audit trail |
| `AIDLC: Open Artifact` | Jump to any step's Markdown output |

---

## ⚙️ Configuration

All settings live under `aidlc.*` in `settings.json` — and can be edited live via the **Settings** tab in the panel.

| Setting | Default | Notes |
|---|---|---|
| `aidlc.apiKey` | `""` | Anthropic key — only needed if Cursor SDK is unavailable |
| `aidlc.model` | `claude-sonnet-4-20250514` | Used only for Anthropic fallback |
| `aidlc.modelOverride` | `""` | Freeform override; takes precedence |
| `aidlc.maxTokens` | `8192` | Per agent response |
| `aidlc.autoApproveYolo` | `false` | YOLO-mode auto-approval |
| `aidlc.gateTimeout` | `0` | Seconds; `0` = wait forever |
| `aidlc.allowedCommands` | `[ls, cat, grep, find, head, tail, wc, echo, mkdir, touch]` | Glob allowlist for agent-invoked shell commands |
| `aidlc.commandConfirmation` | `true` | Prompt before any command runs |
| `aidlc.gitignoreArtifacts` | `false` | Auto-add `.aidlc/` to `.gitignore` |

---

## 📁 Repo layout

```
src/
├── extension.ts                    # VS Code activation, commands, webview host
├── extension/
│   └── engine-bridge.ts            # postMessage bridge: panel ⇄ engine
├── engine/
│   ├── index.ts                    # public API barrel
│   ├── pipeline/                   # schema (zod), loader, validator
│   ├── orchestrator/               # state machine, sequential, loop orchestrator
│   ├── runner/                     # step-runner, auto-reviewer, loop-manager, cascade-reject
│   ├── agents/                     # 12 built-in prompts + registry
│   └── artifacts/                  # skill-loader + 30+ built-in skills
└── panel/                          # React 19 + Tailwind 4 webview
    ├── App.tsx
    ├── hooks/useExtensionState.ts  # subscribes to bridge events
    └── components/
        ├── Sidebar / TopBar / Pipeline / RunsList / DecisionLog / SettingsPage / SkillModal …
        └── dag-canvas/             # @xyflow/react node editor
scripts/
└── probe-scaffold.cjs              # dev tool — sanity-check a freshly scaffolded run
```

---

## 🧬 Tech stack

- **Runtime**: VS Code Extension API (≥ 1.85)
- **Engine**: TypeScript, Zod, gray-matter, yaml, uuid
- **Agents**: `@cursor/sdk` (default) · `@anthropic-ai/sdk` (fallback)
- **Panel**: React 19 · Tailwind CSS 4 · `@xyflow/react` · Vite 6
- **Build**: tsup (extension) · vite (panel) · vsce (packaging)
- **Test**: Vitest

---

## 🧭 Roadmap

- [ ] Parallel-mode orchestrator (currently sequential-first)
- [ ] Diff view between iterations of the same artifact
- [ ] Pipeline marketplace — share `.aidlc/pipelines/*.yaml`
- [ ] First-class MCP tool wiring per step
- [ ] Cost / token budget per run, with hard stops

---

## 🤝 Contributing

Push your work to this repo. Feature branches off `main` are encouraged; open a pull request back to `main` when ready.

If anyone on the team cannot access the repo or needs help, reach out to your team representative: **thinh.nguyen@niteco.se**.

---

## 📄 License

MIT © Team Build & Chill — Niteco AI Hackathon 2026
