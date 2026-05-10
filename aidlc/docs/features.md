# Features

Feature list aligned with the **current codebase** (`team-build-chill-repo`). Use this as a capability checklist; deeper behavior lives in [architecture.md](./architecture.md).

---

## Panel UI

| Feature | Description |
|---------|-------------|
| **Sidebar navigation** | Pipelines, Runs, Editor, Skills, Settings; **Start Run** + **New Pipeline** in footer. |
| **Pipelines library** | Search, run, edit, create blank, create from template, refresh. |
| **Start Run modal** | Pick pipeline + enter prompt in one dialog (sidebar or Runs tab). |
| **Live run view** | Idea input, per-step progress, stream, decision log, approve/reject, open artifact, cancel. |
| **Runs history** | List/filter runs, expand detail, step logs/prompts, events, re-run, resume, gate actions when active. |
| **Pipeline editor** | Timeline-style editor (`PipelineDetailEditor`); save, run from editor, step delete/configure. |
| **Skills library** | List/create/edit Markdown skills in a modal. |
| **Settings page** | Edit `aidlc.*` values in-panel; verify Cursor SDK. |
| **Top bar** | Context title, connection indicator, search on Pipelines tab, back navigation on run/editor. |

---

## Pipeline engine

| Feature | Description |
|---------|-------------|
| **YAML pipelines** | Validated with **Zod** (`PipelineDefinitionSchema`); steps, `depends_on`, `loop_groups`, execution mode. |
| **Sequential orchestration** | Primary path through `SequentialOrchestrator` / loop orchestrator integration. |
| **Step state machine** | Explicit allowed transitions (`STEP_STATUS_TRANSITIONS`). |
| **Human gates** | Steps can enter `in_review`; approve/reject drives continuation. |
| **Retries** | Per-step `maxRetries` and runner-level retry logic. |
| **Loops** | `task`, `phase`, `cascade` loop modes on steps; **loop groups** with max iterations and exit conditions. |
| **Auto-reviewer** | Structural/semantic checks between steps (`AutoReviewer`). |
| **Cascade reject** | Rejection can propagate per cascade rules (`CascadeRejector`). |
| **Dry-run** | Validate pipeline without invoking models (`aidlc.dryRun` → `EngineBridge.runDryRun`). |

---

## Agents and skills

| Feature | Description |
|---------|-------------|
| **Built-in agents** | Registered ids such as `idea-expander`, `requirements-engineer`, `architect`, `executor`, `critic`, etc. (`BUILTIN_AGENTS`). |
| **Custom agents** | Optional `.aidlc/agents/*.md` merged via `AgentRegistry`. |
| **Skills** | `.aidlc/skills/` + built-in skill pack; referenced from step `skills: []`. |

---

## Runners and AI backends

| Feature | Description |
|---------|-------------|
| **Cursor SDK runner** | `CursorSdkStepRunner` — default path when API key and SDK are available. |
| **Anthropic fallback** | `AnthropicStepRunner` when using non-Cursor path. |
| **Model configuration** | `aidlc.model`, `aidlc.modelOverride`, `aidlc.maxTokens`; per-step `model` field defaulting to `composer-2`. |
| **SDK verification** | `verifyCursorSdk` / `runVerifyCursorSdk` probes key + model list + short test run; surfaced in Settings. |

---

## Persistence and workspace

| Feature | Description |
|---------|-------------|
| **`.aidlc` directory** | Pipelines, agents, skills, runs — see [overview.md](./overview.md). |
| **Run store** | Run state JSON and artifacts per `runId` under `runs/`. |
| **Pipeline slug / rename** | Save can derive file basename from display name; **migrates** `pipelineName` in existing run states. |
| **Git hygiene** | Optional `aidlc.gitignoreArtifacts` to add `.aidlc/` to `.gitignore`. |

---

## Safety

| Feature | Description |
|---------|-------------|
| **Command allowlist** | `aidlc.allowedCommands` glob patterns. |
| **Command confirmation** | `aidlc.commandConfirmation` prompts before shell execution. |
| **Gate timeout** | `aidlc.gateTimeout` (seconds; `0` = no timeout). |
| **YOLO auto-approve** | `aidlc.autoApproveYolo` for automatic handling of certain task modes (when applicable in runner). |

---

## Developer experience

| Feature | Description |
|---------|-------------|
| **Dual build** | `tsup` (extension + engine chunks) + `vite` (panel). |
| **TypeScript** | Strict module layout: `extension` ↔ `engine-bridge` ↔ `engine`. |
| **Packaging** | `vsce package` → `.vsix`. |

---

## Roadmap hints (from README)

Not all may be implemented; the root [README](../README.md) lists aspirations: parallel orchestrator polish, artifact diff view, marketplace, MCP wiring, run budgets.
