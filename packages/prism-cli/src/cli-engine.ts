import * as path from "path";
import * as yaml from "yaml";
import { PipelineLoader } from "../../prism/src/engine/pipeline/loader.js";
import { PipelineValidator } from "../../prism/src/engine/pipeline/validator.js";
import { AgentRegistry } from "../../prism/src/engine/agents/registry.js";
import { SkillLoader } from "../../prism/src/engine/artifacts/skill-loader.js";
import { RunStore } from "../../prism/src/engine/runner/cascade-reject.js";
import { LoopOrchestrator } from "../../prism/src/engine/orchestrator/loop-orchestrator.js";
import { StateMachine } from "../../prism/src/engine/orchestrator/state-machine.js";
import { PiSdkStepRunner } from "../../prism/src/engine/runner/pi-sdk-runner.js";
import { loadAllTemplates, TEMPLATE_NAMES } from "../../prism/src/extension/templates/index.js";
import {
  PipelineDefinition,
  PIPELINE_CONFIG_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  RUNS_DIR,
  PIPELINE_DIR,
} from "../../prism/src/engine/pipeline/schema.js";
import type { CliConfig } from "./types.js";
import * as fs from "fs";

export interface PipelineDetail {
  name: string;
  displayName: string;
  stepCount: number;
  description: string;
}

export interface RunSummary {
  runId: string;
  pipelineName: string;
  startedAt: string;
  status: string;
  title?: string;
}

export interface StepSummary {
  id: string;
  name: string;
  agent: string;
  status: string;
  gate: boolean;
  revision: number;
  error?: string;
}

export interface RunState {
  runId: string;
  pipelineName: string;
  status: string;
  startedAt: string;
  steps: StepSummary[];
  decisions: unknown[];
}

export class CliEngine {
  private readonly workspaceRoot: string;
  private readonly loader: PipelineLoader;
  private readonly validator: PipelineValidator;
  private readonly registry: AgentRegistry;
  private readonly skillLoader: SkillLoader;
  private readonly runStore: RunStore;
  private readonly orchestrator: LoopOrchestrator;
  private readonly machine: StateMachine;
  private config: CliConfig;

  constructor(config: CliConfig) {
    this.workspaceRoot = config.workspace;
    this.config = config;
    this.loader = new PipelineLoader({ workspaceRoot: this.workspaceRoot });
    this.validator = new PipelineValidator();
    this.registry = new AgentRegistry(this.workspaceRoot);
    this.skillLoader = new SkillLoader(this.workspaceRoot);
    this.runStore = new RunStore(this.workspaceRoot);
    this.orchestrator = new LoopOrchestrator();
    this.machine = new StateMachine();
  }

  ensureSkeleton(): void {
    const dirs = [PIPELINE_DIR, PIPELINE_CONFIG_DIR, AGENTS_DIR, SKILLS_DIR, RUNS_DIR];
    for (const d of dirs) {
      const full = path.join(this.workspaceRoot, d);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }
    try {
      this.registry.syncBuiltinsToDisk();
    } catch { /* ignore */ }
    try {
      this.skillLoader.syncBuiltinsToDisk();
    } catch { /* ignore */ }

    const existing = new Set(this.loader.listPipelines());
    const templates = loadAllTemplates();
    for (const [name, contents] of Object.entries(templates)) {
      if (existing.has(name)) continue;
      const filePath = path.join(this.workspaceRoot, PIPELINE_CONFIG_DIR, `${name}.yaml`);
      try {
        fs.writeFileSync(filePath, contents, "utf8");
      } catch { /* ignore */ }
    }
  }

  listPipelines(): PipelineDetail[] {
    const out: PipelineDetail[] = [];
    for (const name of this.loader.listPipelines()) {
      try {
        const p = this.loader.loadPipeline(name);
        out.push({
          name,
          displayName: (p.name ?? "").trim() || name,
          stepCount: p.steps.length,
          description: p.description ?? "",
        });
      } catch {
        out.push({ name, displayName: name, stepCount: 0, description: "(failed to load)" });
      }
    }
    return out;
  }

  loadPipeline(name: string): PipelineDefinition {
    return this.loader.loadPipeline(name);
  }

  savePipeline(name: string, pipeline: PipelineDefinition): void {
    this.loader.savePipeline(name, pipeline);
  }

  deletePipeline(name: string): void {
    this.loader.deletePipeline(name);
  }

  createPipelineFromTemplate(templateName: string): { name: string; pipeline: PipelineDefinition } | null {
    const templates = loadAllTemplates();
    const yamlText = templates[templateName];
    if (!yamlText) return null;

    const data = yaml.parse(yamlText) as PipelineDefinition;

    const slug = (data.name ?? templateName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || templateName;

    this.loader.savePipeline(slug, data);
    return { name: slug, pipeline: data };
  }

  createBlankPipeline(): { name: string; pipeline: PipelineDefinition } {
    const blank = {
      name: "My Pipeline",
      version: "1.0",
      steps: [],
      agents: [],
      loop_groups: [],
    } as PipelineDefinition;
    const slug = "my-pipeline";
    this.loader.savePipeline(slug, blank);
    return { name: slug, pipeline: blank };
  }

  getTemplateNames(): readonly string[] {
    return TEMPLATE_NAMES;
  }

  listAgents(): { id: string; label: string; category: string; source: string }[] {
    return this.registry.listAll().map((a) => ({
      id: a.id,
      label: a.label,
      category: a.category,
      source: a.isBuiltin ? "builtin" : "custom",
    }));
  }

  listSkills(): { id: string; label: string; description: string }[] {
    return this.skillLoader.loadAll().map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
  }

  listRuns(): RunSummary[] {
    const out: RunSummary[] = [];
    for (const id of this.runStore.listRuns()) {
      const state = this.runStore.loadState(id);
      if (!state) continue;
      out.push({
        runId: state.runId,
        pipelineName: state.pipelineName,
        startedAt: state.startedAt,
        status: state.status,
        title: state.title,
      });
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  loadRun(runId: string): RunState | null {
    const state = this.runStore.loadState(runId);
    if (!state) return null;

    try {
      const pipeline = this.loader.loadPipeline(state.pipelineName);
      const steps = pipeline.steps.map((def) => {
        const s = state.steps[def.id];
        return {
          id: def.id,
          name: def.name,
          agent: def.agent,
          status: s?.status ?? "pending",
          gate: def.gate,
          revision: s?.revision ?? 0,
          error: s?.error,
        };
      });

      return {
        runId: state.runId,
        pipelineName: state.pipelineName,
        status: state.status,
        startedAt: state.startedAt,
        steps,
        decisions: state.decisions,
      };
    } catch {
      return null;
    }
  }

  async runPipeline(
    pipelineName: string,
    options?: { idea?: string; title?: string; resumeFromStep?: string },
  ): Promise<void> {
    const pipeline = this.loader.loadPipeline(pipelineName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runId = `${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();

    const run = {
      runId,
      pipelineName,
      status: "idle" as const,
      startedAt: now,
      updatedAt: now,
      steps: {},
      decisions: [],
      loopFrames: [],
      loopGroupIterations: {},
      idea: options?.idea ?? "",
      title: options?.title ?? pipelineName,
      description: undefined,
      cwd: this.workspaceRoot,
    };

    this.machine.initStepStates(pipeline, run);
    this.runStore.ensureRunDir(runId);
    this.runStore.saveState(run);

    const signal = { aborted: false };
    const gateResolvers = new Map<string, () => void>();

    const runner = new PiSdkStepRunner({
      apiKey: this.config.piApiKey,
      provider: this.config.provider,
      model: this.config.model,
      allowedCommands: this.config.allowedCommands,
    });

    const pushState = () => {
      // State saved periodically by onDecision callback
    };

    const waitForGate = (stepId: string): Promise<void> =>
      new Promise<void>((resolve) => {
        gateResolvers.set(stepId, resolve);
      });

    await this.orchestrator.run(pipeline, run, {
      cwd: this.workspaceRoot,
      runner,
      agentRegistry: this.registry,
      onEvent: (ev) => {
        this.runStore.appendEvent(run.runId, ev);
        if (ev.type === "prompt") {
          const revision = run.steps[ev.stepId]?.revision ?? 0;
          this.runStore.savePrompt(run.runId, ev.stepId, revision, ev.content, ev.metadata as Record<string, unknown> | undefined);
        }
        // Emit events for CLI output
        if (ev.type === "progress" || ev.type === "text" || ev.type === "thinking") {
          console.log(`  [${ev.stepId}] ${ev.content.slice(0, 120)}`);
        }
      },
      onDecision: (d) => {
        run.decisions.push(d);
        try {
          this.runStore.saveState(run);
        } catch { /* ignore */ }
        pushState();
      },
      waitForGate,
      signal: signal as AbortSignal,
    }, options?.resumeFromStep);
  }

  async dryRun(pipelineName: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    let pipeline: PipelineDefinition;
    try {
      pipeline = this.loader.loadPipeline(pipelineName);
    } catch (err: any) {
      return { valid: false, errors: [`Failed to load: ${err?.message ?? err}`], warnings: [] };
    }

    const issues = this.validator.validate(pipeline);
    const errors = issues.filter((i) => i.type === "error").map((i) => i.message);
    const warnings = issues.filter((i) => i.type === "warning").map((i) => i.message);

    try {
      this.validator.topologicalSort(pipeline);
    } catch (err: any) {
      errors.push(`Dependency error: ${err?.message ?? err}`);
    }

    for (const step of pipeline.steps) {
      try {
        this.registry.load(step.agent);
      } catch {
        warnings.push(`Step "${step.id}" references unregistered agent '${step.agent}'`);
      }
      for (const skillId of step.skills) {
        try {
          this.skillLoader.load(skillId);
        } catch {
          warnings.push(`Step "${step.id}" references missing skill '${skillId}'`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  handleApproveStep(runId: string, stepId: string): boolean {
    const state = this.runStore.loadState(runId);
    if (!state) return false;
    const step = state.steps[stepId];
    if (!step || step.status !== "in_review") return false;
    step.status = "approved";
    this.runStore.saveState(state);
    return true;
  }

  handleRejectStep(runId: string, stepId: string): boolean {
    const state = this.runStore.loadState(runId);
    if (!state) return false;
    const step = state.steps[stepId];
    if (!step) return false;
    step.status = "rejected";
    this.runStore.saveState(state);
    return true;
  }

  getStepArtifact(runId: string, stepId: string): string | null {
    const stepDir = path.join(this.workspaceRoot, PIPELINE_DIR, "runs", runId, "steps", stepId);
    const artifactPath = path.join(stepDir, "latest.md");
    if (!fs.existsSync(artifactPath)) return null;
    return fs.readFileSync(artifactPath, "utf8");
  }

  getConfig(): CliConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CliConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
