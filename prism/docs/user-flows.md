# User flows

This document describes **end-to-end journeys** through the AIDLC panel and related commands. The **sidebar** drives the primary tabs: **Pipelines**, **Runs**, **Editor** (requires a selected pipeline), **Skills**, **Settings**. The **live run view** is a full-width mode without its own sidebar tab (the sidebar still highlights **Pipelines** when you are “in a run”).

---

## 1. Open the product

1. Command Palette → **AIDLC: Open Pipeline** (`aidlc.openPanel`).  
2. The webview loads; the panel sends `init` and receives pipeline list and current bridge state.

**Purpose:** Enter the main workspace for all other flows.

---

## 2. Start a new run with pipeline + prompt

There are several equivalent entry points; all converge on **`startRun`** with a **pipeline basename** (file id, not YAML display name) and an **idea** string.

### 2a. Start Run modal (global)

1. Click **Start Run** in the **sidebar** (footer) **or** **Start Run** on the **Runs** tab header.  
2. Modal opens: choose **pipeline** from dropdown, enter **Idea / Prompt**, optional title/description.  
3. **Start Run** → panel navigates to the **live run view**, loads that pipeline (`editPipeline`), then sends `startRun`.

**Purpose:** Pick pipeline and prompt in **one** step without visiting the pipeline list first.

### 2b. Pipelines tab → Run

1. **Pipelines** tab → find a pipeline card → **Run**.  
2. Extension selects that pipeline and opens the **live run view**.  
3. User fills **IdeaInput** (idea + optional title/description) → **Run Pipeline** sends `startRun`.

### 2c. Editor → Run Pipeline

1. Open a pipeline in **Editor** → **Run Pipeline**.  
2. Opens live run view for that pipeline’s **basename** → user submits idea → `startRun`.

### 2d. Command palette

- **AIDLC: Run Pipeline** (`aidlc.startRun`) opens the panel; user still uses the UI to choose pipeline/idea unless other automation is added.

**Purpose:** Keyboard-driven entry that lands in the same panel.

---

## 3. Live run view (during and after execution)

**Location:** Shown when `view === "run"` in the panel (component `Pipeline.tsx`).

**Typical flow:**

1. **IdeaInput** — user submits idea; message includes `pipeline`, `idea`, optional `title` / `description` / `customRunId` (title may feed run id in the UI).  
2. **Progress** — step cards show status; **AgentStream** shows streamed agent events; **DecisionLog** shows audit events.  
3. **Gates** — if current step is `in_review`, user uses **Approve** / **Reject** (sends `approveStep` / `rejectStep` with `stepId`).  
4. **Artifacts** — open artifact sends `openArtifact` with path from step state.  
5. **Cancel** — `cancelRun` stops the run path the extension exposes.

**Purpose:** Single place to **watch**, **approve**, and **inspect outputs** for the active run.

---

## 4. Runs tab (history and secondary controls)

**Location:** `RunsList.tsx`.

**Flow:**

1. Sidebar → **Runs**. Panel requests `listRuns` (on navigate and on mount).  
2. Expand a row → `selectRun` + `getRunEvents` loads detail, step list, logs.  
3. **Re-run** — navigates to live run for that pipeline (`editPipeline`), then `startRun` with stored `idea` / metadata pattern so the user **sees** the new execution.  
4. **Resume** — `resumeRun` continues a paused run (extension/engine).  
5. **Manual review** — if a step is `in_review`, **Approve** / **Reject** call the same messages as the live view when the row is the **active** run; otherwise **Open Live** prompts to switch to the live run first.

**Purpose:** Audit past work, re-execute, and handle gates without losing context.

---

## 5. Pipelines tab (library and templates)

**Location:** `PipelineListPage.tsx`.

**Flow:**

1. Browse pipelines with search (matches **basename** and **displayName**).  
2. **Run** — starts run flow (section 2b).  
3. **Edit** — opens **Editor** with `editPipeline`.  
4. **Create from template** / **Create new** — extension creates YAML under `.aidlc/pipelines/`; panel receives refreshed `pipelineList` and typically **`pipelineData`** to open the editor.  
5. **Refresh** — `listPipelines`.

**Purpose:** Curate which pipelines exist in the repo and jump to run or edit.

---

## 6. Editor tab (pipeline authoring)

**Location:** `PipelineDetailEditor.tsx` (+ supporting DAG components where used).

**Flow:**

1. Prerequisites: a **selected pipeline** (from Pipelines tab or after create). Sidebar **Editor** is disabled until then.  
2. Edit metadata, steps, gates, skills references, etc.  
3. **Save** — `savePipeline` with `name: <current basename>` and full pipeline object. Bridge may **rename file** if display name slug differs; then `pipelineSaved` + refreshed `pipelineData` / `runList` as needed.  
4. **Delete step** — local state update + save to persist.  
5. **Run Pipeline** — switches to live run for **basename** (not YAML `name:`).

**Purpose:** Maintain `.aidlc/pipelines/*.yaml` without hand-editing raw YAML unless desired.

---

## 7. Skills tab

**Flow:**

1. List skills from bridge state.  
2. **New Skill** / edit card → **SkillModal** → `saveSkill` with id + content.  
3. Skills are available to steps via pipeline YAML `skills: [...]`.

**Purpose:** Centralise reusable instructions (checklists, conventions).

---

## 8. Settings tab

**Flow:**

1. **Settings** → `getSettings` loads `aidlc.*` snapshot into the panel.  
2. User edits API key, model defaults, toggles, etc. → **Save** sends `saveSettings`.  
3. **Verify SDK** → `verifyCursorSdk`; results show inline (`verifyCursorSdkStarted` / `verifyCursorSdkResult`).

**Purpose:** Avoid forcing users to edit `settings.json` manually for common options.

---

## 9. Palette-only / host commands

| Command | Typical use |
|---------|-------------|
| **AIDLC: Resume Run** | Resume from persisted state when not in panel. |
| **AIDLC: Approve / Reject Current Step** | Bound shortcuts or quick actions when panel delegates to host. |
| **AIDLC: Dry-Run Pipeline** | Validate first pipeline without LLM calls. |
| **AIDLC: Open Artifact** | Jump to a path under `.aidlc`. |
| **AIDLC: Open Settings** | Native VS Code settings UI (in addition to panel Settings). |

---

## 10. Failure and diagnostics

- **Panel error banner** — surfaced when extension posts `{ type: "error", message }`.  
- **Toast notifications** — `vscode.window.showErrorMessage` / `showInformationMessage` for save/start failures.  
- **Output channel “AIDLC”** — engine and bridge logs, SDK verification details.

**Purpose:** Make silent failures visible (especially `startRun` and SDK misconfiguration).
