# Panel ↔ extension protocol

The webview panel and extension host communicate with **structured JSON messages** over `vscode.postMessage` / `webview.onDidReceiveMessage`. This document lists the main **panel → extension** and **extension → panel** message types used in this repository.

Types are **conventions** (TypeScript `switch` on `msg.type`), not a single exported union in one file.

---

## Panel → extension

| `type` | Purpose | Typical payload |
|--------|---------|-----------------|
| `init` | Bootstrap session | (none) — triggers full init response from extension |
| `startRun` | Begin pipeline execution | `pipeline` (basename), `idea`, optional `title`, `description`, `customRunId` |
| `approveStep` | Accept gated step | `stepId` |
| `rejectStep` | Reject gated step | `stepId` |
| `cancelRun` | Stop current run | — |
| `resumeRun` | Resume paused run | — |
| `openArtifact` | Open file in editor | `path` (relative to workspace / `.aidlc`) |
| `editPipeline` | Load pipeline into panel | `name` (basename) |
| `createPipeline` | Create blank pipeline | — |
| `createFromTemplate` | Clone template | `template` id/string |
| `savePipeline` | Persist YAML | `name` (current basename), `pipeline` (definition object) |
| `renamePipeline` | Rename pipeline file | `oldName`, `newName` (basenames) |
| `saveSkill` | Persist skill markdown | `id`, `content` |
| `listRuns` | Refresh run index | — |
| `listPipelines` | Refresh pipeline index | — |
| `selectRun` | Load run detail | `runId` |
| `getRunEvents` | Events for a run | `runId` |
| `getStepLog` | Artifact/log for step | `runId`, `stepId` |
| `getStepPrompt` | Prompt used for step | `runId`, `stepId` |
| `rerunStep` | Rerun single step | per handler |
| `getSettings` | Read VS Code `aidlc` config | — |
| `saveSettings` | Write VS Code `aidlc` config | `settings` object (partial) |
| `verifyCursorSdk` | Probe Cursor SDK / API key | — |

**Implementation:** `src/extension.ts` — `_handlePanelMessage` / `switch (msg.type)`.

---

## Extension → panel

| `type` | Purpose | Payload |
|--------|---------|---------|
| `bootstrap` | First load after `init` | `pipelines`, `agents`, `skills`, `state` (bridge snapshot) |
| `stateUpdate` | Run / step progress changed | `state` |
| `agentEvent` | Streaming tokens / tool progress | `event` (shape: `AgentEvent` — see engine schema) |
| `agentStatus` | High-level runner status line | `status` |
| `decision` | Append-only audit entry | `decision` |
| `pipelineList` | Pipeline index | `pipelines` |
| `pipelineData` | Full YAML-bound object for editor | `name`, `pipeline`, `agents`, `skills` |
| `pipelineSaved` | Save finished | `name`, optional `renamedFrom` |
| `runList` | Run history index | `runs` |
| `runState` | Expanded run snapshot | `state` |
| `runEvents` | Log events for selected run | `events` |
| `stepLog` | Artifact body or log | `stepId`, `content` |
| `stepPrompt` | Prompt text for step | `stepId`, `content` |
| `skillSaved` | Skill write succeeded | `id` |
| `skillList` | Refreshed skills array | `skills` |
| `settings` | Config snapshot | `settings` |
| `verifyCursorSdkStarted` | UI: show spinner | — |
| `verifyCursorSdkResult` | Probe finished | `result` |
| `error` | User-visible failure | `message` |

**Wrappers:** `agentEvent` and `decision` use **`msg.event`** / **`msg.decision`** on the wire (see `EngineBridge` callbacks in `extension.ts`).

**Panel handling:** `useExtensionState` updates React state for most of the above. Messages such as `skillList` are emitted by the extension today but **fall through** the panel `switch` until a handler is added (skills still refresh on the next `bootstrap` / navigation).

---

## Notes for contributors

1. **Pipeline id** — Always use **file basename** in `startRun.pipeline` and `editPipeline.name` unless a handler explicitly expects something else.  
2. **Race safety** — After `savePipeline` with rename, extension may emit **`pipelineSaved`**, fresh **`pipelineData`**, and **`runList`** so clients update `selectedPipeline` and history.  
3. **Adding a message** — Extend both `extension.ts` and `useExtensionState.ts` (and any component that `send`s it).
