import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { z } from "zod";
import { OpenCodeAgent } from "@prism/sdk";
import { Type } from "@earendil-works/pi-ai";
import type { CliConfig } from "./types.js";

// ───────────────────────── Schema (minimal subset) ─────────────────────────

const StepDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  agent: z.string(),
  model: z.string().default("composer-2"),
  gate: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(0).max(60000).default(0),
  retryBackoffMultiplier: z.number().min(1).max(10).default(2),
  artifact: z.string(),
  depends_on: z.array(z.string()).default([]),
  loop: z.object({
    mode: z.enum(["task", "phase", "cascade"]),
    agent: z.string().optional(),
    maxIterations: z.number().int().min(1).max(50).default(3),
    target: z.string().optional(),
  }).optional(),
  tags: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
});

const PipelineDefinitionSchema = z.object({
  name: z.string(),
  version: z.string().default("1.0"),
  description: z.string().optional(),
  execution: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
  steps: z.array(StepDefinitionSchema).min(1),
  agents: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    category: z.string().default("custom"),
    systemPrompt: z.string().default(""),
  })).default([]),
  loop_groups: z.array(z.object({
    name: z.string(),
    steps: z.array(z.string()).min(2),
    maxIterations: z.number().int().min(1).max(50).default(3),
    exitOn: z.enum(["all_pass", "last_pass"]),
  })).default([]),
});

type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
type StepDefinition = z.infer<typeof StepDefinitionSchema>;

const PIPELINE_DIR = ".PRISM";
const PIPELINE_CONFIG_DIR = `${PIPELINE_DIR}/pipelines`;
const AGENTS_DIR = `${PIPELINE_DIR}/agents`;
const SKILLS_DIR = `${PIPELINE_DIR}/skills`;
const RUNS_DIR = `${PIPELINE_DIR}/runs`;

const BUILTIN_AGENTS = [
  "idea-expander", "requirements-engineer", "architect", "task-generator",
  "executor", "critic", "test-writer", "reporter", "security-reviewer",
  "performance-reviewer", "docs-writer", "migration-planner",
] as const;

// ───────────────────────── Pipeline Loader ─────────────────────────

class PipelineLoader {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get pipelinesDir(): string {
    return path.join(this.workspaceRoot, PIPELINE_CONFIG_DIR);
  }

  listPipelines(): string[] {
    if (!fs.existsSync(this.pipelinesDir)) return [];
    return fs.readdirSync(this.pipelinesDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .map((f) => f.replace(/\.(yaml|yml)$/, ""));
  }

  loadPipeline(name: string): PipelineDefinition {
    const filePath = path.join(this.pipelinesDir, `${name}.yaml`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Pipeline '${name}' not found`);
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const data = yaml.parse(raw);
    return PipelineDefinitionSchema.parse(data);
  }

  savePipeline(name: string, pipeline: PipelineDefinition): void {
    const filePath = path.join(this.pipelinesDir, `${name}.yaml`);
    fs.writeFileSync(filePath, yaml.stringify(pipeline, { indent: 2 }), "utf8");
  }

  deletePipeline(name: string): void {
    const yamlPath = path.join(this.pipelinesDir, `${name}.yaml`);
    const ymlPath = path.join(this.pipelinesDir, `${name}.yml`);
    if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath);
    if (fs.existsSync(ymlPath)) fs.unlinkSync(ymlPath);
  }
}

// ───────────────────────── Agent Registry ─────────────────────────

class AgentRegistry {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get agentsDir(): string {
    return path.join(this.workspaceRoot, AGENTS_DIR);
  }

  listAll(): { id: string; label: string; category: string; isBuiltin: boolean }[] {
    const out: { id: string; label: string; category: string; isBuiltin: boolean }[] = [];

    for (const id of BUILTIN_AGENTS) {
      out.push({ id, label: id, category: "builtin", isBuiltin: true });
    }

    if (fs.existsSync(this.agentsDir)) {
      for (const file of fs.readdirSync(this.agentsDir)) {
        if (!file.endsWith(".md")) continue;
        const id = file.replace(/\.md$/, "");
        if (!BUILTIN_AGENTS.includes(id as any)) {
          out.push({ id, label: id, category: "custom", isBuiltin: false });
        }
      }
    }

    return out;
  }

  syncBuiltinsToDisk(): void {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
    for (const id of BUILTIN_AGENTS) {
      const filePath = path.join(this.agentsDir, `${id}.md`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# ${id}\n\nYou are a ${id} agent.\n`, "utf8");
      }
    }
  }
}

// ───────────────────────── Skill Loader ─────────────────────────

class SkillLoader {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get skillsDir(): string {
    return path.join(this.workspaceRoot, SKILLS_DIR);
  }

  listAll(): { id: string; label: string; description: string }[] {
    if (!fs.existsSync(this.skillsDir)) return [];
    const out: { id: string; label: string; description: string }[] = [];
    for (const file of fs.readdirSync(this.skillsDir)) {
      if (!file.endsWith(".md")) continue;
      const id = file.replace(/\.md$/, "");
      out.push({ id, label: id, description: "" });
    }
    return out;
  }

  syncBuiltinsToDisk(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }
}

// ───────────────────────── Run Store ─────────────────────────

interface RunState {
  runId: string;
  pipelineName: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  steps: Record<string, { status: string; revision: number; error?: string }>;
  decisions: unknown[];
  title?: string;
}

class RunStore {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get runsDir(): string {
    return path.join(this.workspaceRoot, RUNS_DIR);
  }

  listRuns(): string[] {
    if (!fs.existsSync(this.runsDir)) return [];
    return fs.readdirSync(this.runsDir).filter((f) => fs.statSync(path.join(this.runsDir, f)).isDirectory());
  }

  loadState(runId: string): RunState | null {
    const statePath = path.join(this.runsDir, runId, "state.json");
    if (!fs.existsSync(statePath)) return null;
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  }

  saveState(state: RunState): void {
    this.ensureRunDir(state.runId);
    const statePath = path.join(this.runsDir, state.runId, "state.json");
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  ensureRunDir(runId: string): void {
    const runDir = path.join(this.runsDir, runId);
    if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
  }
}

// ───────────────────────── Pipeline Validator ─────────────────────────

class PipelineValidator {
  validate(pipeline: PipelineDefinition): { type: "error" | "warning"; message: string }[] {
    const issues: { type: "error" | "warning"; message: string }[] = [];
    const stepIds = new Set(pipeline.steps.map((s) => s.id));

    for (const step of pipeline.steps) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          issues.push({ type: "error", message: `Step '${step.id}' depends on unknown step '${dep}'` });
        }
      }
    }

    return issues;
  }

  topologicalSort(pipeline: PipelineDefinition): string[] {
    const inDegree: Record<string, number> = {};
    for (const step of pipeline.steps) {
      inDegree[step.id] = step.depends_on.length;
    }

    const queue = Object.entries(inDegree)
      .filter(([, d]) => d === 0)
      .map(([id]) => id);

    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const step of pipeline.steps) {
        if (step.depends_on.includes(id)) {
          inDegree[step.id]--;
          if (inDegree[step.id] === 0) queue.push(step.id);
        }
      }
    }

    if (result.length !== pipeline.steps.length) {
      throw new Error("Pipeline contains a dependency cycle");
    }
    return result;
  }
}

// ───────────────────────── Templates ─────────────────────────

const TEMPLATE_NAMES = [
  "default", "feature-build", "code-review", "bug-fix",
  "full-stack-feature", "refactor", "prd-to-prototype", "blank",
] as const;

function loadAllTemplates(): Record<string, string> {
  const templates: Record<string, string> = {};
  for (const name of TEMPLATE_NAMES) {
    const filePath = path.join(__dirname, "..", "..", "prism", "src", "extension", "templates", `${name}.yaml`);
    if (fs.existsSync(filePath)) {
      templates[name] = fs.readFileSync(filePath, "utf8");
    }
  }
  return templates;
}

// ───────────────────────── CLI Engine ─────────────────────────

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

export interface RunStateSummary {
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
  private config: CliConfig;

  constructor(config: CliConfig) {
    this.workspaceRoot = config.workspace;
    this.config = config;
    this.loader = new PipelineLoader(this.workspaceRoot);
    this.validator = new PipelineValidator();
    this.registry = new AgentRegistry(this.workspaceRoot);
    this.skillLoader = new SkillLoader(this.workspaceRoot);
    this.runStore = new RunStore(this.workspaceRoot);
  }

  ensureSkeleton(): void {
    const dirs = [PIPELINE_DIR, PIPELINE_CONFIG_DIR, AGENTS_DIR, SKILLS_DIR, RUNS_DIR];
    for (const d of dirs) {
      const full = path.join(this.workspaceRoot, d);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }
    this.registry.syncBuiltinsToDisk();
    this.skillLoader.syncBuiltinsToDisk();

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
        out.push({ name, displayName: (p.name ?? "").trim() || name, stepCount: p.steps.length, description: p.description ?? "" });
      } catch {
        out.push({ name, displayName: name, stepCount: 0, description: "(failed to load)" });
      }
    }
    return out;
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

  getTemplateNames(): readonly string[] {
    return TEMPLATE_NAMES;
  }

  listAgents(): { id: string; label: string; category: string; source: string }[] {
    return this.registry.listAll().map((a) => ({
      id: a.id, label: a.label, category: a.category, source: a.isBuiltin ? "builtin" : "custom",
    }));
  }

  listSkills(): { id: string; label: string; description: string }[] {
    return this.skillLoader.listAll();
  }

  listRuns(): RunSummary[] {
    const out: RunSummary[] = [];
    for (const id of this.runStore.listRuns()) {
      const state = this.runStore.loadState(id);
      if (!state) continue;
      out.push({ runId: state.runId, pipelineName: state.pipelineName, startedAt: state.startedAt, status: state.status, title: state.title });
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  loadRun(runId: string): RunStateSummary | null {
    const state = this.runStore.loadState(runId);
    if (!state) return null;

    try {
      const pipeline = this.loader.loadPipeline(state.pipelineName);
      const steps = pipeline.steps.map((def) => {
        const s = state.steps[def.id];
        return { id: def.id, name: def.name, agent: def.agent, status: s?.status ?? "pending", gate: def.gate, revision: s?.revision ?? 0, error: s?.error };
      });
      return { runId: state.runId, pipelineName: state.pipelineName, status: state.status, startedAt: state.startedAt, steps, decisions: state.decisions };
    } catch {
      return null;
    }
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

    return { valid: errors.length === 0, errors, warnings };
  }

  async runPipeline(
    pipelineName: string,
    options?: { idea?: string; title?: string },
  ): Promise<void> {
    const pipeline = this.loader.loadPipeline(pipelineName);
    const order = this.validator.topologicalSort(pipeline);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runId = `${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();

    const steps: Record<string, { status: string; revision: number; error?: string }> = {};
    for (const def of pipeline.steps) {
      steps[def.id] = { status: "pending", revision: 0 };
    }

    const runState: RunState = {
      runId, pipelineName, status: "running", startedAt: now, updatedAt: now,
      steps, decisions: [], title: options?.title ?? pipelineName,
    };
    this.runStore.saveState(runState);

    for (const stepId of order) {
      const stepDef = pipeline.steps.find((s) => s.id === stepId);
      if (!stepDef) continue;

      const stepState = steps[stepId];
      if (stepState.status === "approved" || stepState.status === "skipped") continue;

      stepState.revision++;
      stepState.status = "running";
      this.runStore.saveState(runState);

      console.log(`  ⟳ ${stepId}: ${stepDef.name}...`);

      try {
        const agent = new OpenCodeAgent({
          provider: this.config.provider,
          model: this.config.model,
          apiKey: this.config.piApiKey,
          systemPrompt: `You are the ${stepDef.agent} agent. ${stepDef.name ? `Your task: ${stepDef.name}.` : ""}`,
        });

        const contextParts: string[] = [];
        if (options?.idea) contextParts.push(`## Idea\n\n${options.idea}`);
        contextParts.push(`## Step\n\n- Name: ${stepDef.name}\n- ID: ${stepDef.id}\n- Artifact: ${stepDef.artifact}`);

        const prevArtifacts: string[] = [];
        for (const prevStep of pipeline.steps) {
          if (prevStep.id === stepId) break;
          const artifactPath = path.join(this.workspaceRoot, PIPELINE_DIR, "runs", runId, "steps", prevStep.id, "latest.md");
          if (fs.existsSync(artifactPath)) {
            const content = fs.readFileSync(artifactPath, "utf8");
            prevArtifacts.push(`### ${prevStep.id}\n\n${content.slice(0, 2000)}`);
          }
        }
        if (prevArtifacts.length > 0) {
          contextParts.push(`## Previous Artifacts\n\n${prevArtifacts.join("\n\n")}`);
        }

        const result = await agent.prompt(contextParts.join("\n\n"));
        const output = result.message || "";

        const artifactDir = path.join(this.workspaceRoot, PIPELINE_DIR, "runs", runId, "steps", stepId);
        fs.mkdirSync(artifactDir, { recursive: true });
        fs.writeFileSync(path.join(artifactDir, "latest.md"), output, "utf8");

        stepState.status = "approved";
        this.runStore.saveState(runState);
        console.log(`  ✓ ${stepId}: approved`);
      } catch (err: any) {
        stepState.status = "failed";
        stepState.error = err?.message ?? String(err);
        this.runStore.saveState(runState);
        console.log(`  ✗ ${stepId}: ${stepState.error}`);
        throw err;
      }
    }

    runState.status = "completed";
    runState.updatedAt = new Date().toISOString();
    this.runStore.saveState(runState);
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
