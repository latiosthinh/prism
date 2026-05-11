import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as yaml from "yaml";
import {
  PipelineDefinition,
  PipelineRunState,
  StepStatus,
  RunStatus,
  Decision,
  AgentEvent,
  PIPELINE_DIR,
  PIPELINE_CONFIG_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  RUNS_DIR,
} from "../engine/pipeline/schema.js";
import { PipelineLoader } from "../engine/pipeline/loader.js";
import { AgentRegistry, AgentLoadResult } from "../engine/agents/registry.js";
import { SkillLoader, SkillEntry } from "../engine/artifacts/skill-loader.js";
import {
  CursorSdkStepRunner,
  AnthropicStepRunner,
  StepRunner,
} from "../engine/runner/step-runner.js";
import {
  PiSdkStepRunner,
  PiSdkRunnerConfig,
} from "../engine/runner/pi-sdk-runner.js";
import { RunStore } from "../engine/runner/cascade-reject.js";
import { LoopOrchestrator } from "../engine/orchestrator/loop-orchestrator.js";
import { StateMachine } from "../engine/orchestrator/state-machine.js";

export interface AgentStatus {
  stepId: string;
  stepName: string;
  status: string;
  progress: string;
}

export interface StepStateSummary {
  id: string;
  name: string;
  agent: string;
  model: string;
  status: StepStatus;
  gate: boolean;
  revision: number;
  retriesRemaining: number;
  outputArtifact?: string;
  error?: string;
}

export interface BridgeState {
  pipelineName: string;
  runId: string;
  runStatus: RunStatus;
  steps: StepStateSummary[];
  currentStepId: string | null;
  decisions: Decision[];
  pipeline?: PipelineDefinition;
}

export interface BridgeLogger {
  appendLine(message: string): void;
  show?(): void;
}

export interface BridgeConfig {
  workspaceRoot: string;
  apiKey?: string;
  backend?: "cursor" | "pi" | "anthropic";
  piProvider?: string;
  piModel?: string;
  piApiKey?: string;
  onStateUpdate: (state: BridgeState) => void;
  onAgentEvent: (event: AgentEvent) => void;
  onAgentStatus: (status: AgentStatus) => void;
  onDecision: (decision: Decision) => void;
  onError: (error: string) => void;
}

interface RunSummary {
  runId: string;
  pipelineName: string;
  startedAt: string;
  status: string;
  title?: string;
  description?: string;
  idea?: string;
}

export interface StartRunOptions {
  idea?: string;
  title?: string;
  description?: string;
  customRunId?: string;
}

const DEFAULT_PIPELINE_YAML = `name: default
version: "1.0"
description: "Full SDLC: brainstorm → requirements → design → tasks → implement → verify → test → report"
execution:
  mode: sequential
steps:
  - id: brainstorm
    name: Brainstorm
    agent: idea-expander
    artifact: idea.md
    gate: true
    tags: [product]
  - id: requirements
    name: Requirements
    agent: requirements-engineer
    artifact: requirements.md
    depends_on: [brainstorm]
    gate: true
    tags: [product]
  - id: design
    name: Design
    agent: architect
    artifact: design.md
    depends_on: [requirements]
    gate: true
    tags: [technical]
  - id: tasks
    name: Tasks
    agent: task-generator
    artifact: tasks.md
    depends_on: [design]
    gate: true
    tags: [technical]
  - id: implementation
    name: Implementation
    agent: executor
    artifact: tasks.md
    depends_on: [tasks]
    gate: false
    tags: [code, build, implement]
    loop:
      mode: task
      agent: critic
      maxIterations: 3
  - id: build-verify
    name: Build Verify
    agent: critic
    artifact: build-report.md
    depends_on: [implementation]
    gate: false
    tags: [quality]
  - id: test-generation
    name: Test Generation
    agent: test-writer
    artifact: tests.md
    depends_on: [build-verify]
    gate: false
    tags: [quality]
  - id: report
    name: Report
    agent: reporter
    artifact: report.md
    depends_on: [test-generation]
    gate: true
    tags: [product]
loop_groups:
  - name: implementation-verify
    steps: [implementation, build-verify]
    maxIterations: 3
    exitOn: all_pass
`;

const FEATURE_BUILD_YAML = `name: feature-build
version: "1.0"
description: "Quick feature build: design → implement → test"
execution:
  mode: sequential
steps:
  - id: design
    name: Feature Design
    agent: architect
    artifact: design.md
    gate: true
    tags: [technical]
  - id: implement
    name: Implement Feature
    agent: executor
    artifact: tasks.md
    depends_on: [design]
    tags: [code, build, implement]
  - id: test
    name: Test Feature
    agent: test-writer
    artifact: tests.md
    depends_on: [implement]
    tags: [quality]
`;

const CODE_REVIEW_YAML = `name: code-review
version: "1.0"
description: "Lightweight pipeline: review existing code and report findings"
execution:
  mode: sequential
steps:
  - id: review
    name: Review Code
    agent: critic
    artifact: review.md
    gate: true
    tags: [quality]
  - id: report
    name: Report Findings
    agent: reporter
    artifact: report.md
    depends_on: [review]
    tags: [product]
`;

const BUG_FIX_YAML = `name: bug-fix
version: "1.0"
description: "Triage → fix → verify a reported bug"
execution:
  mode: sequential
steps:
  - id: investigate
    name: Investigate
    agent: architect
    artifact: investigation.md
    gate: true
    tags: [technical]
  - id: fix
    name: Apply Fix
    agent: executor
    artifact: tasks.md
    depends_on: [investigate]
    tags: [code, build, implement]
  - id: verify
    name: Verify Fix
    agent: critic
    artifact: verify.md
    depends_on: [fix]
    tags: [quality]
`;

const FULL_STACK_FEATURE_YAML = `name: full-stack-feature
version: "1.0"
description: "End-to-end feature: design → UI spec → implement → test → docs → security review"
execution:
  mode: sequential
steps:
  - id: design
    name: Technical Design
    agent: architect
    artifact: design.md
    gate: true
    tags: [technical]
  - id: ui-spec
    name: UI Spec
    agent: architect
    artifact: ui-spec.md
    depends_on: [design]
    gate: true
    tags: [technical, ui]
  - id: implement
    name: Implementation
    agent: executor
    artifact: tasks.md
    depends_on: [ui-spec]
    tags: [code, build, implement]
    loop:
      mode: task
      agent: critic
      maxIterations: 3
  - id: test
    name: Tests
    agent: test-writer
    artifact: tests.md
    depends_on: [implement]
    tags: [quality]
  - id: security
    name: Security Review
    agent: security-reviewer
    artifact: security-review.md
    depends_on: [test]
    gate: true
    tags: [quality, security]
  - id: docs
    name: Documentation
    agent: docs-writer
    artifact: docs.md
    depends_on: [security]
    tags: [product]
`;

const REFACTOR_YAML = `name: refactor
version: "1.0"
description: "Safe refactor: analyze → plan → refactor → verify with critic loop"
execution:
  mode: sequential
steps:
  - id: analyze
    name: Analyze Code
    agent: critic
    artifact: analysis.md
    gate: true
    tags: [quality]
  - id: plan
    name: Refactor Plan
    agent: architect
    artifact: refactor-plan.md
    depends_on: [analyze]
    gate: true
    tags: [technical]
  - id: refactor
    name: Apply Refactor
    agent: executor
    artifact: tasks.md
    depends_on: [plan]
    tags: [code, implement]
    loop:
      mode: task
      agent: critic
      maxIterations: 3
  - id: verify
    name: Verify Behavior
    agent: test-writer
    artifact: tests.md
    depends_on: [refactor]
    gate: true
    tags: [quality]
`;

const PRD_TO_PROTOTYPE_YAML = `name: prd-to-prototype
version: "1.0"
description: "From idea to working prototype: brainstorm → requirements → design → prototype"
execution:
  mode: sequential
steps:
  - id: brainstorm
    name: Brainstorm
    agent: idea-expander
    artifact: idea.md
    gate: true
    tags: [product]
  - id: requirements
    name: Requirements
    agent: requirements-engineer
    artifact: requirements.md
    depends_on: [brainstorm]
    gate: true
    tags: [product]
  - id: design
    name: Design
    agent: architect
    artifact: design.md
    depends_on: [requirements]
    gate: true
    tags: [technical]
  - id: prototype
    name: Build Prototype
    agent: executor
    artifact: tasks.md
    depends_on: [design]
    tags: [code, build, implement]
    loop:
      mode: task
      agent: critic
      maxIterations: 3
`;

const BLANK_PIPELINE_YAML = `name: pipeline
version: "1.0"
description: "Blank pipeline — customize steps, agents, and skills in the editor"
execution:
  mode: sequential
steps:
  - id: step-1
    name: First Step
    agent: idea-expander
    model: composer-2
    artifact: output.md
    gate: true
    tags: [product]
`;

const TEMPLATE_YAML: Record<string, string> = {
  default: DEFAULT_PIPELINE_YAML,
  "feature-build": FEATURE_BUILD_YAML,
  "code-review": CODE_REVIEW_YAML,
  "bug-fix": BUG_FIX_YAML,
  "full-stack-feature": FULL_STACK_FEATURE_YAML,
  refactor: REFACTOR_YAML,
  "prd-to-prototype": PRD_TO_PROTOTYPE_YAML,
};

export class EngineBridge {
  pipelines: string[] = [];
  agents: AgentLoadResult[] = [];
  skills: SkillEntry[] = [];

  private readonly _workspaceRoot: string;
  private _apiKey?: string;
  private _backend: "cursor" | "pi" | "anthropic";
  private _piProvider: string;
  private _piModel: string;
  private _piApiKey?: string;
  private readonly _log: BridgeLogger;
  private readonly _onStateUpdate: BridgeConfig["onStateUpdate"];
  private readonly _onAgentEvent: BridgeConfig["onAgentEvent"];
  private readonly _onAgentStatus: BridgeConfig["onAgentStatus"];
  private readonly _onDecision: BridgeConfig["onDecision"];
  private readonly _onError: BridgeConfig["onError"];

  private readonly _loader: PipelineLoader;
  private readonly _registry: AgentRegistry;
  private readonly _skillLoader: SkillLoader;
  private readonly _runStore: RunStore;
  private _runner: StepRunner;
  private readonly _orchestrator: LoopOrchestrator;
  private readonly _machine: StateMachine;

  private _currentRun: PipelineRunState | null = null;
  private _activePipeline: PipelineDefinition | null = null;
  private _signal: AbortController | null = null;
  private _gateResolvers: Map<string, () => void> = new Map();

  constructor(config: BridgeConfig, log: BridgeLogger) {
    this._workspaceRoot = config.workspaceRoot;
    this._apiKey = config.apiKey;
    this._backend = config.backend || "cursor";
    this._piProvider = config.piProvider || "anthropic";
    this._piModel = config.piModel || "claude-sonnet-4-20250514";
    this._piApiKey = config.piApiKey;
    this._log = log;
    this._onStateUpdate = config.onStateUpdate;
    this._onAgentEvent = config.onAgentEvent;
    this._onAgentStatus = config.onAgentStatus;
    this._onDecision = config.onDecision;
    this._onError = config.onError;

    this._loader = new PipelineLoader({ workspaceRoot: this._workspaceRoot });
    this._registry = new AgentRegistry(this._workspaceRoot);
    this._skillLoader = new SkillLoader(this._workspaceRoot);
    this._runStore = new RunStore(this._workspaceRoot);
    this._runner = this.createRunner(this._backend);
    this._orchestrator = new LoopOrchestrator();
    this._machine = new StateMachine();
  }

  private createRunner(backend: "cursor" | "pi" | "anthropic"): StepRunner {
    switch (backend) {
      case "pi":
        if (!this._piApiKey) {
          throw new Error("Pi SDK requires aidlc.piApiKey to be set");
        }
        return new PiSdkStepRunner({
          apiKey: this._piApiKey,
          provider: this._piProvider,
          model: this._piModel,
        });
      case "anthropic":
        return this._apiKey
          ? new AnthropicStepRunner(this._apiKey)
          : new AnthropicStepRunner();
      case "cursor":
      default:
        return this._apiKey
          ? new CursorSdkStepRunner(this._apiKey)
          : new CursorSdkStepRunner();
    }
  }

  updateApiKey(apiKey: string | undefined): void {
    this._apiKey = apiKey;
    this._runner = this.createRunner(this._backend);
  }

  updateBackend(backend: "cursor" | "pi" | "anthropic", options?: { piProvider?: string; piModel?: string; piApiKey?: string }): void {
    this._backend = backend;
    if (options?.piProvider) this._piProvider = options.piProvider;
    if (options?.piModel) this._piModel = options.piModel;
    if (options?.piApiKey) this._piApiKey = options.piApiKey;
    this._runner = this.createRunner(backend);
  }

  ensureSkeletonExists(): void {
    const dirs = [
      PIPELINE_DIR,
      PIPELINE_CONFIG_DIR,
      AGENTS_DIR,
      SKILLS_DIR,
      RUNS_DIR,
    ];
    for (const d of dirs) {
      const full = path.join(this._workspaceRoot, d);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }

    try {
      this._registry.syncBuiltinsToDisk();
    } catch (err: any) {
      this._log.appendLine(
        `[bridge] syncBuiltinsToDisk(agents) failed: ${err?.message ?? err}`,
      );
    }

    try {
      this._skillLoader.syncBuiltinsToDisk();
    } catch (err: any) {
      this._log.appendLine(
        `[bridge] syncBuiltinsToDisk(skills) failed: ${err?.message ?? err}`,
      );
    }

    const existing = new Set(this._loader.listPipelines());
    for (const [name, contents] of Object.entries(TEMPLATE_YAML)) {
      if (existing.has(name)) continue;
      const filePath = path.join(
        this._workspaceRoot,
        PIPELINE_CONFIG_DIR,
        `${name}.yaml`,
      );
      try {
        fs.writeFileSync(filePath, contents, "utf8");
      } catch (err: any) {
        this._log.appendLine(
          `[bridge] failed to write template '${name}': ${err?.message ?? err}`,
        );
      }
    }

    this.refreshCaches();
  }

  refreshCaches(): void {
    this.pipelines = this._loader.listPipelines();
    this.agents = this._registry.listAll();
    this.skills = this._skillLoader.loadAll();
  }

  selectPipeline(name: string): PipelineDefinition {
    const pipeline = this._loader.loadPipeline(name);
    this._activePipeline = pipeline;
    return pipeline;
  }

  getPipelinesDetail(): {
    name: string;
    displayName: string;
    stepCount: number;
    description: string;
  }[] {
    const out: {
      name: string;
      displayName: string;
      stepCount: number;
      description: string;
    }[] = [];
    for (const name of this._loader.listPipelines()) {
      try {
        const p = this._loader.loadPipeline(name);
        // `name` stays the file basename (a.k.a. pipeline id) — handlers like
        // editPipeline / startRun / savePipeline use it to resolve the .yaml.
        // `displayName` is the human-readable `name:` field from inside the yaml.
        out.push({
          name,
          displayName: (p.name ?? "").trim() || name,
          stepCount: p.steps.length,
          description: p.description ?? "",
        });
      } catch (err: any) {
        out.push({
          name,
          displayName: name,
          stepCount: 0,
          description: `(failed to load: ${err?.message ?? err})`,
        });
      }
    }
    return out;
  }

  async startRun(
    pipelineName: string,
    pipeline: PipelineDefinition,
    ideaOrOptions?: string | StartRunOptions,
  ): Promise<void> {
    this._activePipeline = pipeline;

    const options: StartRunOptions =
      typeof ideaOrOptions === "string"
        ? { idea: ideaOrOptions }
        : ideaOrOptions ?? {};
    const idea = options.idea ?? "";

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedCustom = options.customRunId
      ? options.customRunId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
      : "";
    const baseId = sanitizedCustom
      ? `${sanitizedCustom}-${timestamp}`
      : `${timestamp}-${uuidv4().slice(0, 8)}`;
    const runId = baseId;
    const now = new Date().toISOString();

    const autoTitle = idea
      ? idea.replace(/\s+/g, " ").trim().slice(0, 60)
      : "";
    const title = options.title?.trim() || autoTitle || pipelineName;

    const run: PipelineRunState = {
      runId,
      pipelineName,
      status: "idle",
      startedAt: now,
      updatedAt: now,
      steps: {},
      decisions: [],
      loopFrames: [],
      loopGroupIterations: {},
      idea,
      title,
      description: options.description?.trim() || undefined,
      cwd: this._workspaceRoot,
    };
    this._machine.initStepStates(pipeline, run);
    this._currentRun = run;

    if (idea) {
      run.decisions.push({
        id: uuidv4(),
        timestamp: now,
        type: "run_started",
        summary: idea,
      });
    }

    this._runStore.ensureRunDir(runId);
    this._runStore.saveState(run);

    this._signal = new AbortController();
    this._gateResolvers.clear();

    const pushState = (): void => {
      this._onStateUpdate(this.getBridgeState());
    };
    pushState();

    const waitForGate = (stepId: string): Promise<void> =>
      new Promise<void>((resolve) => {
        this._gateResolvers.set(stepId, resolve);
      });

    try {
      await this._orchestrator.run(pipeline, run, {
        cwd: this._workspaceRoot,
        runner: this._runner,
        agentRegistry: this._registry,
        onEvent: (ev) => {
          this._runStore.appendEvent(run.runId, ev);
          if (ev.type === "prompt") {
            const revision = run.steps[ev.stepId]?.revision ?? 0;
            this._runStore.savePrompt(
              run.runId,
              ev.stepId,
              revision,
              ev.content,
              ev.metadata as Record<string, unknown> | undefined,
            );
          }
          this._onAgentEvent(ev);
          this._onAgentStatus({
            stepId: ev.stepId,
            stepName: ev.stepId,
            status: ev.type,
            progress: ev.content,
          });
        },
        onDecision: (d) => {
          run.decisions.push(d);
          this._onDecision(d);
          try {
            this._runStore.saveState(run);
          } catch (err: any) {
            this._log.appendLine(
              `[bridge] saveState failed: ${err?.message ?? err}`,
            );
          }
          pushState();
        },
        waitForGate,
        signal: this._signal.signal,
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this._log.appendLine(`[bridge] orchestrator error: ${msg}`);
      this._onError(msg);
    } finally {
      try {
        this._runStore.saveState(run);
      } catch {
        /* ignore */
      }
      pushState();
    }
  }

  handleApproveStep(stepId: string): void {
    const run = this._currentRun;
    if (!run) return;
    const step = run.steps[stepId];
    if (!step) return;
    if (step.status === "in_review") {
      this._machine.transitionStep(run, stepId, "approved");
    }
    const resolver = this._gateResolvers.get(stepId);
    if (resolver) {
      this._gateResolvers.delete(stepId);
      resolver();
    }
    this._onStateUpdate(this.getBridgeState());
  }

  handleRejectStep(stepId: string): void {
    const run = this._currentRun;
    if (!run) return;
    const step = run.steps[stepId];
    if (!step) return;
    if (step.status === "in_review" || step.status === "approved") {
      this._machine.transitionStep(run, stepId, "rejected");
    }
    const resolver = this._gateResolvers.get(stepId);
    if (resolver) {
      this._gateResolvers.delete(stepId);
      resolver();
    }
    this._onStateUpdate(this.getBridgeState());
  }

  cancelRun(): void {
    this._signal?.abort();
    if (this._currentRun) {
      this._machine.setRunStatus(this._currentRun, "cancelled");
      this._onStateUpdate(this.getBridgeState());
    }
  }

  async resumeRun(): Promise<void> {
    const runs = this._runStore.listRuns();
    if (runs.length === 0) {
      this._onError("No previous runs found to resume");
      return;
    }
    const lastId = runs[runs.length - 1];
    const state = this._runStore.loadState(lastId);
    if (!state) {
      this._onError(`Failed to load run ${lastId}`);
      return;
    }
    const pipeline = this._loader.loadPipeline(state.pipelineName);
    this._currentRun = state;
    this._activePipeline = pipeline;
    this._onStateUpdate(this.getBridgeState());
    await this.startRun(state.pipelineName, pipeline, state.idea);
  }

  listRuns(): RunSummary[] {
    const out: RunSummary[] = [];
    for (const id of this._runStore.listRuns()) {
      const state = this._runStore.loadState(id);
      if (!state) continue;
      out.push({
        runId: state.runId,
        pipelineName: state.pipelineName,
        startedAt: state.startedAt,
        status: state.status,
        title: state.title,
        description: state.description,
        idea: state.idea,
      });
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  loadRunEvents(runId: string): unknown[] {
    return this._runStore.loadEvents(runId);
  }

  loadStepPrompt(runId: string, stepId: string): string | null {
    return this._runStore.loadPrompt(runId, stepId);
  }

  loadRunById(runId: string): PipelineRunState | null {
    return this._runStore.loadState(runId);
  }

  getBridgeState(): BridgeState {
    const run = this._currentRun;
    const pipeline = this._activePipeline ?? undefined;

    if (!run) {
      return {
        pipelineName: pipeline?.name ?? "",
        runId: "",
        runStatus: "idle",
        steps: pipeline ? this._summarizeFromPipeline(pipeline) : [],
        currentStepId: null,
        decisions: [],
        pipeline,
      };
    }

    const steps: StepStateSummary[] = [];
    if (pipeline) {
      for (const def of pipeline.steps) {
        const s = run.steps[def.id];
        steps.push({
          id: def.id,
          name: def.name,
          agent: def.agent,
          model: def.model,
          status: s?.status ?? "pending",
          gate: def.gate,
          revision: s?.revision ?? 0,
          retriesRemaining: s?.retriesRemaining ?? def.maxRetries,
          outputArtifact: s?.outputArtifact,
          error: s?.error,
        });
      }
    }

    return {
      pipelineName: run.pipelineName,
      runId: run.runId,
      runStatus: run.status,
      steps,
      currentStepId: run.currentStepId ?? null,
      decisions: run.decisions,
      pipeline,
    };
  }

  private _summarizeFromPipeline(
    pipeline: PipelineDefinition,
  ): StepStateSummary[] {
    return pipeline.steps.map((def) => ({
      id: def.id,
      name: def.name,
      agent: def.agent,
      model: def.model,
      status: "pending" as StepStatus,
      gate: def.gate,
      revision: 0,
      retriesRemaining: def.maxRetries,
    }));
  }

  /**
   * Slugify a human display name into a safe file basename.
   * Falls back to `fallback` when the input slugs to empty.
   */
  static slugifyPipelineName(name: string, fallback: string): string {
    const slug = (name ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return slug || fallback;
  }

  /**
   * Pick a unique slug among existing pipeline file basenames. The current
   * file (if any) is excluded so saving without a display-name change is a no-op.
   */
  private uniquePipelineSlug(desired: string, currentName?: string): string {
    const existing = new Set(this._loader.listPipelines());
    if (currentName) existing.delete(currentName);
    if (!existing.has(desired)) return desired;
    let i = 2;
    while (existing.has(`${desired}-${i}`)) i++;
    return `${desired}-${i}`;
  }

  savePipeline(name: string, pipeline: PipelineDefinition): void {
    this._loader.savePipeline(name, pipeline);
    this.refreshCaches();
  }

  /**
   * Save a pipeline, deriving the file basename from `pipeline.name`
   * (slugified). When the slug differs from `currentName`, the old file is
   * removed (rename). Returns the canonical basename actually written.
   */
  saveAndRenamePipeline(
    currentName: string,
    pipeline: PipelineDefinition,
  ): { name: string; renamedFrom?: string } {
    const desired = EngineBridge.slugifyPipelineName(
      pipeline.name ?? "",
      currentName,
    );
    const finalName = this.uniquePipelineSlug(desired, currentName);
    this._loader.savePipeline(finalName, pipeline);
    if (finalName !== currentName) {
      try {
        this._loader.deletePipeline(currentName);
      } catch {
        /* old file may not exist (e.g. first save of a freshly created pipeline) */
      }
      // Keep historical runs pointing at the new file so resume / rerun work.
      this.migrateRunPipelineName(currentName, finalName);
      // Also patch the in-memory current run if it referenced the old name.
      if (this._currentRun?.pipelineName === currentName) {
        this._currentRun.pipelineName = finalName;
      }
    }
    this.refreshCaches();
    return finalName !== currentName
      ? { name: finalName, renamedFrom: currentName }
      : { name: finalName };
  }

  /**
   * Walk every persisted run state and rewrite `pipelineName` from `oldName`
   * to `newName`. Called whenever a pipeline file is renamed so that
   * resume / rerun continue to resolve to the right yaml.
   */
  private migrateRunPipelineName(oldName: string, newName: string): void {
    if (oldName === newName) return;
    let touched = 0;
    for (const id of this._runStore.listRuns()) {
      const state = this._runStore.loadState(id);
      if (!state || state.pipelineName !== oldName) continue;
      state.pipelineName = newName;
      try {
        this._runStore.saveState(state);
        touched++;
      } catch (err: any) {
        this._log.appendLine(
          `[bridge] migrateRunPipelineName: failed to rewrite ${id}: ${err?.message ?? err}`,
        );
      }
    }
    if (touched > 0) {
      this._log.appendLine(
        `[bridge] migrated ${touched} run state(s) "${oldName}" → "${newName}"`,
      );
    }
  }

  deletePipelineFile(name: string): void {
    this._loader.deletePipeline(name);
    this.refreshCaches();
  }

  renamePipeline(oldName: string, newName: string): void {
    const p = this._loader.loadPipeline(oldName);
    p.name = newName;
    this._loader.savePipeline(newName, p);
    this._loader.deletePipeline(oldName);
    this.migrateRunPipelineName(oldName, newName);
    if (this._currentRun?.pipelineName === oldName) {
      this._currentRun.pipelineName = newName;
    }
    this.refreshCaches();
  }

  cloneFromTemplate(
    template: string,
  ): { name: string; pipeline: PipelineDefinition } | null {
    const yamlText = TEMPLATE_YAML[template];
    if (!yamlText) return null;
    const data = yaml.parse(yamlText) as PipelineDefinition;
    // Derive the file basename from the (possibly fancy) display name in the
    // template, then dedupe. Keep the in-yaml display name intact.
    const desired = EngineBridge.slugifyPipelineName(data.name ?? "", template);
    const candidate = this.uniquePipelineSlug(desired);
    this._loader.savePipeline(candidate, data);
    this.refreshCaches();
    return { name: candidate, pipeline: data };
  }

  createBlankPipeline(): { name: string; pipeline: PipelineDefinition } {
    const data = yaml.parse(BLANK_PIPELINE_YAML) as PipelineDefinition;
    const desired = EngineBridge.slugifyPipelineName(
      data.name ?? "",
      "pipeline",
    );
    const candidate = this.uniquePipelineSlug(desired);
    this._loader.savePipeline(candidate, data);
    this.refreshCaches();
    return { name: candidate, pipeline: data };
  }

  saveSkill(id: string, content: string): void {
    this._skillLoader.save(id, content);
    this.refreshCaches();
  }

  rerunStep(stepId: string): boolean {
    const run = this._currentRun;
    if (!run) return false;
    const state = run.steps[stepId];
    if (!state) return false;
    state.status = "pending";
    state.error = undefined;
    state.retriesRemaining =
      this._activePipeline?.steps.find((s) => s.id === stepId)?.maxRetries ?? 3;
    this._onStateUpdate(this.getBridgeState());
    return true;
  }

  runDryRun(pipelineName: string): void {
    let pipeline: PipelineDefinition;
    try {
      pipeline = this._loader.loadPipeline(pipelineName);
    } catch (err: any) {
      this._onError(`Dry-run: ${err?.message ?? err}`);
      return;
    }
    const tokenEstimate = pipeline.steps.length * 500;
    const summary =
      `Dry-run "${pipeline.name}":\n` +
      `  - steps: ${pipeline.steps.length}\n` +
      `  - estimated tokens: ~${tokenEstimate}\n` +
      `  - agents: ${pipeline.agents.length}\n` +
      `  - loop_groups: ${pipeline.loop_groups.length}`;
    const ev: AgentEvent = {
      type: "progress",
      stepId: "dry-run",
      content: summary,
      timestamp: new Date().toISOString(),
    };
    this._onAgentEvent(ev);
  }
}
