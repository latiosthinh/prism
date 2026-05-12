import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as yaml from "yaml";
import * as diff from "diff";
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
import { PipelineValidator } from "../engine/pipeline/validator.js";

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
  artifactDiff?: ArtifactDiff;
}

export interface ArtifactDiff {
  added: number;
  removed: number;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
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

export interface TelemetryUpdate {
  steps: Array<{
    stepId: string;
    stepName: string;
    agent: string;
    model: string;
    provider: string;
    tokensIn: number;
    tokensOut: number;
    tokensCachedIn: number;
    costUsd: number;
    startedAtMs: number;
    completedAtMs: number;
    status: string;
  }>;
  budgetUsd: number;
}

export class AuditWatcher {
  private _watcher: fs.FSWatcher | null = null;
  private _debounceTimer: NodeJS.Timeout | null = null;
  private _lastSize = 0;
  private _runDir: string | null = null;

  constructor(
    private readonly _onAuditEvent: (event: any) => void,
    private readonly _onTelemetryUpdate: (update: TelemetryUpdate) => void,
    private readonly _debounceMs = 150,
  ) {}

  start(runDir: string): void {
    this.stop();
    this._runDir = runDir;
    this._lastSize = 0;

    const auditFile = path.join(runDir, "decisions.jsonl");
    if (!fs.existsSync(auditFile)) {
      fs.writeFileSync(auditFile, "", "utf8");
    }

    try {
      this._watcher = fs.watch(auditFile, { persistent: false }, () => {
        this._scheduleRead(auditFile);
      });
      this._lastSize = fs.statSync(auditFile).size;
    } catch {
      // fs.watch may fail on some platforms; gracefully degrade
    }
  }

  stop(): void {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    this._runDir = null;
  }

  private _scheduleRead(auditFile: string): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._readNewEvents(auditFile);
    }, this._debounceMs);
  }

  private _readNewEvents(auditFile: string): void {
    try {
      const stat = fs.statSync(auditFile);
      if (stat.size <= this._lastSize) return;

      const fd = fs.openSync(auditFile, "r");
      const buffer = Buffer.alloc(stat.size - this._lastSize);
      fs.readSync(fd, buffer, 0, buffer.length, this._lastSize);
      fs.closeSync(fd);

      const newContent = buffer.toString("utf8");
      this._lastSize = stat.size;

      const lines = newContent.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          this._onAuditEvent(event);
        } catch {
          // skip malformed lines
        }
      }

      this._sendTelemetryUpdate();
    } catch {
      // ignore read errors
    }
  }

  private _sendTelemetryUpdate(): void {
    if (!this._runDir) return;
    try {
      const stateFile = path.join(this._runDir, "state.json");
      if (!fs.existsSync(stateFile)) return;

      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      const steps = Object.values(state.steps || {}).map((s: any) => ({
        stepId: s.id,
        stepName: s.name,
        agent: s.agent,
        model: s.model,
        provider: s.provider ?? "",
        tokensIn: s.tokensIn ?? 0,
        tokensOut: s.tokensOut ?? 0,
        tokensCachedIn: s.tokensCachedIn ?? 0,
        costUsd: s.costUsd ?? 0,
        startedAtMs: s.startedAtMs ?? 0,
        completedAtMs: s.completedAtMs ?? 0,
        status: s.status,
      }));

      this._onTelemetryUpdate({
        steps,
        budgetUsd: state.budgetUsd ?? 0,
      });
    } catch {
      // ignore parse errors
    }
  }
}

export interface BridgeConfig {
  workspaceRoot: string;
  apiKey?: string;
  backend?: "cursor" | "pi" | "anthropic";
  piProvider?: string;
  piModel?: string;
  piApiKey?: string;
  allowedCommands?: string[];
  getSecrets?: (key: string) => Promise<string | undefined>;
  storeSecret?: (key: string, value: string) => Promise<void>;
  deleteSecret?: (key: string) => Promise<void>;
  onStateUpdate: (state: BridgeState) => void;
  onAgentEvent: (event: AgentEvent) => void;
  onAgentStatus: (status: AgentStatus) => void;
  onDecision: (decision: Decision) => void;
  onError: (error: string) => void;
  onAuditEvent?: (event: any) => void;
  onTelemetryUpdate?: (update: TelemetryUpdate) => void;
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

import { loadAllTemplates } from "./templates/index.js";

const TEMPLATE_YAML = loadAllTemplates();

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
  private _allowedCommands: string[];
  private readonly _log: BridgeLogger;
  private readonly _onStateUpdate: BridgeConfig["onStateUpdate"];
  private readonly _onAgentEvent: BridgeConfig["onAgentEvent"];
  private readonly _onAgentStatus: BridgeConfig["onAgentStatus"];
  private readonly _onDecision: BridgeConfig["onDecision"];
  private readonly _onError: BridgeConfig["onError"];
  private readonly _onAuditEvent: BridgeConfig["onAuditEvent"];
  private readonly _onTelemetryUpdate: BridgeConfig["onTelemetryUpdate"];
  private readonly _auditWatcher: AuditWatcher;

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
    this._allowedCommands = config.allowedCommands || [];
    this._log = log;
    this._onStateUpdate = config.onStateUpdate;
    this._onAgentEvent = config.onAgentEvent;
    this._onAgentStatus = config.onAgentStatus;
    this._onDecision = config.onDecision;
    this._onError = config.onError;
    this._onAuditEvent = config.onAuditEvent;
    this._onTelemetryUpdate = config.onTelemetryUpdate;
    this._auditWatcher = new AuditWatcher(
      (event) => this._onAuditEvent?.(event),
      (update) => this._onTelemetryUpdate?.(update),
    );

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
          throw new Error("Pi SDK requires prism.piApiKey to be set");
        }
        return new PiSdkStepRunner({
          apiKey: this._piApiKey,
          provider: this._piProvider,
          model: this._piModel,
          allowedCommands: this._allowedCommands,
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

    const runDir = this._runStore.getRunDir(runId);
    this._auditWatcher.start(runDir);

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
      this._auditWatcher.stop();
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

  async resumeRun(resumeFromStep?: string): Promise<void> {
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

    // Find the step to resume from: use explicit override, then find first failed/paused step
    let targetStep = resumeFromStep;
    if (!targetStep) {
      for (const step of pipeline.steps) {
        const s = state.steps[step.id];
        if (s && (s.status === "failed" || s.status === "in_review" || s.status === "rejected")) {
          targetStep = step.id;
          break;
        }
      }
    }

    // Reset failed/rejected target step so it can be retried
    if (targetStep && state.steps[targetStep]) {
      const target = state.steps[targetStep];
      if (target.status !== "in_review") {
        target.status = "pending";
        target.error = undefined;
        target.retriesRemaining = pipeline.steps.find((s) => s.id === targetStep)?.maxRetries ?? 3;
      }
    }

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
      await this._orchestrator.run(pipeline, state, {
        cwd: this._workspaceRoot,
        runner: this._runner,
        agentRegistry: this._registry,
        onEvent: (ev) => {
          this._runStore.appendEvent(state.runId, ev);
          if (ev.type === "prompt") {
            const revision = state.steps[ev.stepId]?.revision ?? 0;
            this._runStore.savePrompt(state.runId, ev.stepId, revision, ev.content, ev.metadata as Record<string, unknown> | undefined);
          }
          this._onAgentEvent(ev);
          this._onAgentStatus({ stepId: ev.stepId, stepName: ev.stepId, status: ev.type, progress: ev.content });
        },
        onDecision: (d) => {
          state.decisions.push(d);
          this._onDecision(d);
          try {
            this._runStore.saveState(state);
          } catch (err: any) {
            this._log.appendLine(`[bridge] saveState failed: ${err?.message ?? err}`);
          }
          pushState();
        },
        waitForGate,
        signal: this._signal.signal,
      }, targetStep);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this._log.appendLine(`[bridge] resume orchestrator error: ${msg}`);
      this._onError(msg);
    } finally {
      try {
        this._runStore.saveState(state);
      } catch { /* ignore */ }
      pushState();
    }
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
        const artifactDiff = s?.status === "in_review" || s?.status === "approved"
          ? this.computeArtifactDiff(run.runId, def.id)
          : undefined;
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
          artifactDiff,
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
      artifactDiff: undefined,
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

  private computeArtifactDiff(runId: string, stepId: string): ArtifactDiff | undefined {
    try {
      const stepDir = path.join(this._workspaceRoot, PIPELINE_DIR, "runs", runId, "steps", stepId);
      const currentPath = path.join(stepDir, "latest.md");
      const archiveDir = path.join(stepDir, "archive");
      if (!fs.existsSync(currentPath)) return undefined;

      const currentContent = fs.readFileSync(currentPath, "utf8");

      // Find the previous revision
      if (!fs.existsSync(archiveDir)) return undefined;
      const revisions = fs.readdirSync(archiveDir)
        .filter((f) => f.startsWith("rev-") && f.endsWith(".md"))
        .sort();
      if (revisions.length < 2) return undefined;

      const prevFile = revisions[revisions.length - 2];
      const prevContent = fs.readFileSync(path.join(archiveDir, prevFile), "utf8");

      if (prevContent === currentContent) return undefined;

      const changes = diff.structuredPatch(prevFile, currentPath, prevContent, currentContent);
      const hunks = changes.hunks.map((h) => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        lines: h.lines,
      }));

      let added = 0;
      let removed = 0;
      for (const line of changes.hunks.flatMap((h) => h.lines)) {
        if (line.startsWith("+") && !line.startsWith("+++")) added++;
        else if (line.startsWith("-") && !line.startsWith("---")) removed++;
      }

      return { added, removed, hunks };
    } catch {
      return undefined;
    }
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
    const lines: string[] = [];
    const emit = (content: string): void => {
      lines.push(content);
      const ev: AgentEvent = {
        type: "progress",
        stepId: "dry-run",
        content,
        timestamp: new Date().toISOString(),
      };
      this._onAgentEvent(ev);
    };

    let pipeline: PipelineDefinition;
    try {
      pipeline = this._loader.loadPipeline(pipelineName);
    } catch (err: any) {
      emit(`✗ Failed to load pipeline: ${err?.message ?? err}`);
      return;
    }

    emit(`\n═══ Dry-Run: "${pipeline.name}" ═══\n`);

    // 1. Schema validation
    const dryValidator = new PipelineValidator();
    const issues = dryValidator.validate(pipeline);
    const errors = issues.filter((i) => i.type === "error");
    const warnings = issues.filter((i) => i.type === "warning");
    if (errors.length > 0) {
      for (const e of errors) {
        emit(`✗ ERROR: ${e.message}`);
      }
    }
    if (warnings.length > 0) {
      for (const w of warnings) {
        emit(`⚠ WARNING: ${w.message}`);
      }
    }
    if (errors.length === 0 && warnings.length === 0) {
      emit("✓ Schema validation passed");
    }

    // 2. Dependency resolution
    try {
      const order = dryValidator.topologicalSort(pipeline);
      emit(`✓ Topological sort OK (${order.length} steps)`);
      emit(`  Execution order: ${order.join(" → ")}`);
    } catch (err: any) {
      emit(`✗ Topological sort failed: ${err?.message ?? err}`);
      return;
    }

    // 3. Agent existence check
    for (const step of pipeline.steps) {
      try {
        this._registry.load(step.agent);
      } catch {
        emit(`⚠ Step "${step.id}" references unregistered agent '${step.agent}'`);
      }
    }

    // 4. Skill existence check
    for (const step of pipeline.steps) {
      for (const skillId of step.skills) {
        try {
          this._skillLoader.load(skillId);
        } catch {
          emit(`⚠ Step "${step.id}" references missing skill '${skillId}'`);
        }
      }
    }

    // 5. Provider/model validation
    const validProviders = ["cursor", "pi", "anthropic"];
    const provider = pipeline.execution?.provider ?? "cursor";
    if (!validProviders.includes(provider)) {
      emit(`⚠ Unknown provider: ${provider}`);
    }

    // 6. Parallel groups
    try {
      const groups = dryValidator.findParallelGroups(pipeline);
      const parallelCount = groups.filter((g) => g.length > 1).length;
      if (parallelCount > 0) {
        emit(`✓ ${parallelCount} parallel execution group(s) detected`);
      }
    } catch {
      /* findParallelGroups isn't critical */
    }

    // 7. Summary
    const totalTokens = pipeline.steps.length * 8192;
    const tokenEstimate = pipeline.steps.length * 500;

    emit(`\n─── Summary ───`);
    emit(`  Steps:       ${pipeline.steps.length}`);
    emit(`  Agents:      ${pipeline.agents.length}`);
    emit(`  Loop groups: ${pipeline.loop_groups.length}`);
    emit(`  Max tokens:  ${totalTokens.toLocaleString()} (all steps combined)`);
    emit(`  Est. usage:  ~${tokenEstimate.toLocaleString()} tokens`);
    emit(`  Gate steps:  ${pipeline.steps.filter((s) => s.gate).length}`);

    if (errors.length > 0) {
      emit(`\n✗ Dry-run found ${errors.length} error(s) — fix before running.`);
    } else {
      emit(`\n✓ Dry-run passed — pipeline is valid.\n`);
    }
  }
}
