# Architecture

## High-level layers

```mermaid
flowchart TB
  subgraph host [VS Code Extension Host]
    EXT[src/extension.ts]
    BRIDGE[src/extension/engine-bridge.ts]
    ENG[src/engine/*]
    EXT --> BRIDGE
    BRIDGE --> ENG
  end
  subgraph ui [Webview - Chromium]
    PANEL[src/panel - React + Vite]
    PANEL <-->|postMessage| EXT
  end
  DISK[(.aidlc on disk)]
  BRIDGE --> DISK
  ENG --> DISK
  SDK[@cursor/sdk / Anthropic]
  ENG --> SDK
```

1. **`src/extension.ts`** — activation, command registration, webview lifecycle, **message switchboard** for panel RPC-style calls.  
2. **`src/extension/engine-bridge.ts`** — **EngineBridge**: loads pipelines/agents/skills, owns `LoopOrchestrator` + `StateMachine`, persists runs, fans out **state / events / decisions** to the panel via callbacks that become `postMessage`.  
3. **`src/engine/`** — **headless** pipeline engine: schema, load/validate, orchestrate, run steps, review, loops, cascade reject. No VS Code imports inside core modules (extension imports vscode; engine does not).  
4. **`src/panel/`** — **React 19** SPA built with **Vite**, embedded in the webview. **`useExtensionState`** subscribes to `window.addEventListener("message")` and sends messages with `vscode.postMessage` when running under VS Code.

## Build and packaging

| Output | Tool | Role |
|--------|------|------|
| `dist/extension.js` (and chunked engine files) | **tsup** | Extension host bundle; `main` in `package.json` points here. |
| `dist/panel/` | **vite build** | Static HTML/JS/CSS; extension loads this into the webview `WebviewPanel`. |

`npm run build` runs both. **`vscode` and `@cursor/sdk` are external** for the extension bundle (provided at runtime).

## Engine module map

| Path | Responsibility |
|------|----------------|
| `engine/pipeline/schema.ts` | Zod schemas, constants (`PIPELINE_DIR`, …), types: `PipelineDefinition`, `StepStatus`, `PipelineRunState`, `Decision`, `AgentEvent`, … |
| `engine/pipeline/loader.ts` | Read/write YAML pipelines from `.aidlc/pipelines/` |
| `engine/pipeline/validator.ts` | DAG validity, references, loop/group constraints |
| `engine/orchestrator/state-machine.ts` | Legal **step status** transitions (`STEP_STATUS_TRANSITIONS`) |
| `engine/orchestrator/sequential.ts` | Sequential execution strategy |
| `engine/orchestrator/loop-orchestrator.ts` | Topology, gates, retries, loop groups — coordinates multi-step runs |
| `engine/runner/step-runner.ts` | Invokes **CursorSdkStepRunner** or **AnthropicStepRunner** per step |
| `engine/runner/auto-reviewer.ts` | Post-step validation (structural / semantic hooks) |
| `engine/runner/loop-manager.ts` | Task/phase loop iteration |
| `engine/runner/cascade-reject.ts` | Cascade semantics + **RunStore** (persistence helpers for run state) |
| `engine/agents/registry.ts` | Resolve agent definitions (built-in + disk) |
| `engine/agents/builtins.ts` | Built-in agent prompts / metadata |
| `engine/artifacts/skill-loader.ts` | Load and compose skills for prompts |
| `engine/index.ts` | Public exports for the extension and tests |

## EngineBridge (conceptual)

`EngineBridge` is the **adapter** between “VS Code / panel concepts” and the engine:

- **Select pipeline** — `selectPipeline(basename)` loads YAML and refreshes cached agent/skill lists as needed.  
- **startRun** — creates or continues run state, passes **idea / title / description** into run metadata, starts orchestration (async).  
- **saveAndRenamePipeline** — persists YAML; can **slugify** display name → file basename, **rename file**, and **migrate** `pipelineName` inside stored run states so resume/rerun stay valid.  
- **Callbacks** — `onStateUpdate`, `onAgentEvent`, `onAgentStatus`, `onDecision`, `onError` → extension posts typed messages to the webview.

## Panel state flow

1. Panel mounts → sends `{ type: "init" }`.  
2. Extension responds with bootstrap payloads: pipeline list, optional run list, `stateUpdate`, settings if requested, etc.  
3. User actions → **discrete messages** (`startRun`, `savePipeline`, …).  
4. Long-running run → streaming **`agentEvent`**, **`agentStatus`**, periodic **`stateUpdate`**, **`decision`** entries.

See [panel-extension-protocol.md](./panel-extension-protocol.md) for message names and direction.

## Identifiers (important for contributors)

| Field | Use |
|------|-----|
| `pipeline` / `pipelineName` in messages and run state | **File basename** (e.g. `simple-executor`), not the YAML display `name: Simple Executor`. |
| YAML `name:` | Display / human-readable; may drive **slug** on save in editor flows. |
| `runId` | UUID (or custom id when provided) per folder under `runs/`. |

Mixing display-derived names with loader keys was a common source of “pipeline not found” bugs; the UI and `startRun` should consistently use **basename**.

## Security and sandboxing

- **API keys** — stored in VS Code `aidlc.*` configuration; bridge may **refresh from config** at `startRun`.  
- **Shell commands** — agent-invoked commands go through **allowlist** (`aidlc.allowedCommands`) and optional **`aidlc.commandConfirmation`** (user prompt per command).  
- **Webview** — untrusted UI code; all privileged work happens in the extension host via messages.

## Extension commands (command palette)

Declared in `package.json` `contributes.commands` (e.g. `aidlc.openPanel`, `aidlc.startRun`, `aidlc.resumeRun`, …). Some handlers are also exposed from **panel buttons** by sending the same logical operations as messages.

**Note:** Additional commands may be registered in code (for example SDK verification). If a command does not appear in the palette, check `package.json` `contributes.commands` and align registration with contributions for discoverability.
