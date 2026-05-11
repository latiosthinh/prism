# Overview

## Purpose

**AIDLC** (AI Development Life Cycle) is a **VS Code / Cursor extension** that runs software delivery workflows as **structured, gated pipelines**. Instead of one-off chats with a model, you define (or pick) a **directed graph of steps**: each step uses a **specialised agent**, writes a **Markdown artifact** under `.aidlc/`, and can pause for **human approval** before the next step runs.

The goal is to make AI-assisted development:

- **Repeatable** — same pipeline, many runs, comparable outputs  
- **Reviewable** — artifacts and a decision log are first-class  
- **Safe** — gates, retries, command allowlists, optional confirmation  
- **Integrated** — lives in the editor, uses workspace files and the Cursor SDK where configured  

## Who it is for

Teams and individuals who want **“CI for cognition”**: a visible SDLC-shaped workflow (brainstorm → requirements → design → implementation → review → tests → report, or lighter variants) without leaving Cursor.

## Core concepts

| Concept | Meaning |
|--------|---------|
| **Pipeline** | A YAML definition: metadata, execution mode (`sequential` today; `parallel` declared in schema), ordered steps with `depends_on`, optional `loop_groups`. |
| **Pipeline file id** | The **file basename** (e.g. `simple-executor`) under `.aidlc/pipelines/*.yaml`. The UI and `startRun` use this as the stable key. The YAML `name:` field is a **display name** and may differ. |
| **Step** | One unit of work: `id`, `agent`, `model`, `artifact` path, `gate`, `depends_on`, optional `loop`, `skills`, `tags`. |
| **Agent** | Prompt + role. Built-in agents ship with the extension; custom agents can live in `.aidlc/agents/*.md` (loaded by the registry). |
| **Skill** | Reusable Markdown instruction injected into steps; built-ins + `.aidlc/skills/`. |
| **Run** | One execution of a pipeline for a workspace. State, decisions, and artifacts for that run live under `.aidlc/runs/<run-id>/`. Runs can be **listed**, **resumed**, and **re-run** (new run, same pipeline + idea pattern). |
| **Gate** | If `gate: true`, after the agent finishes the step waits in **`in_review`** until approve/reject (unless overridden by settings such as auto-approve paths). |
| **Loop** | Per-step `loop` config (`task`, `phase`, `cascade`) plus optional **`loop_groups`** for multi-step iteration with caps. Implemented in the loop orchestrator and related runners. |

## Workspace layout (`.aidlc/`)

Typical layout after scaffolding or first use:

```text
.aidlc/
  pipelines/      # *.yaml — pipeline definitions
  agents/          # optional custom agent markdown
  skills/         # optional custom skill markdown
  runs/           # one folder per run — state, logs, artifacts
```

The extension resolves paths relative to the **workspace root** it is activated for.

## Execution backends

- **Primary**: **Cursor SDK** (`@cursor/sdk`) — agents run with models such as `composer-2` when `aidlc.apiKey` is set (Cursor API key).  
- **Fallback**: **Anthropic** SDK — used when Cursor path is not available; model settings apply there.

See [features.md](./features.md) for settings and [architecture.md](./architecture.md) for where this is wired (`StepRunner`).

## Relation to the root README

The repository [README](../README.md) is the **product-facing** quick start (install, commands table, high-level diagram). These docs go deeper on **flows** and **implementation boundaries**.
