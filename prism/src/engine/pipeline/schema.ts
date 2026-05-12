import { z } from "zod";

// ───────────────────────── Constants ─────────────────────────

export const PIPELINE_DIR = ".PRISM";
export const PIPELINE_CONFIG_DIR = `${PIPELINE_DIR}/pipelines`;
export const AGENTS_DIR = `${PIPELINE_DIR}/agents`;
export const SKILLS_DIR = `${PIPELINE_DIR}/skills`;
export const RUNS_DIR = `${PIPELINE_DIR}/runs`;

export const BUILTIN_AGENTS = [
  "idea-expander",
  "requirements-engineer",
  "architect",
  "task-generator",
  "executor",
  "critic",
  "test-writer",
  "reporter",
  "security-reviewer",
  "performance-reviewer",
  "docs-writer",
  "migration-planner",
] as const;
export type BuiltinAgentId = (typeof BUILTIN_AGENTS)[number];

// ───────────────────────── Zod schemas ─────────────────────────

export const LoopConfigSchema = z.object({
  mode: z.enum(["task", "phase", "cascade"]),
  agent: z.string().optional(),
  maxIterations: z.number().int().min(1).max(50).default(3),
  target: z.string().optional(),
});
export type LoopConfig = z.infer<typeof LoopConfigSchema>;

export const LoopGroupSchema = z.object({
  name: z.string(),
  steps: z.array(z.string()).min(2),
  maxIterations: z.number().int().min(1).max(50).default(3),
  exitOn: z.enum(["all_pass", "last_pass"]),
});
export type LoopGroup = z.infer<typeof LoopGroupSchema>;

export const StepDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase, digits, or '-'"),
  name: z.string(),
  agent: z.string(),
  model: z.string().default("composer-2"),
  gate: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayMs: z.number().int().min(0).max(60000).default(0),
  retryBackoffMultiplier: z.number().min(1).max(10).default(2),
  artifact: z.string(),
  depends_on: z.array(z.string()).default([]),
  loop: LoopConfigSchema.optional(),
  tags: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  condition: z.string().optional(),
  outputSchema: z
    .object({
      requiredSections: z.array(z.string()).default([]),
      format: z.enum(["markdown", "json", "text"]).default("markdown"),
    })
    .optional(),
  mcp_servers: z.array(z.string()).default([]),
  context_files: z.array(z.string()).default([]),
  budget_usd: z.number().min(0).optional(),
});
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;

export const AgentDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  category: z.string().default("custom"),
  systemPrompt: z.string().default(""),
  artifactFile: z.string().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const PipelineDefinitionSchema = z.object({
  name: z.string(),
  version: z.string().default("1.0"),
  description: z.string().optional(),
  execution: z
    .object({
      mode: z.enum(["sequential", "parallel"]),
      defaultLoop: LoopConfigSchema.optional(),
    })
    .default({ mode: "sequential" }),
  steps: z.array(StepDefinitionSchema).min(1),
  agents: z.array(AgentDefinitionSchema).default([]),
  loop_groups: z.array(LoopGroupSchema).default([]),
  budget_usd: z.number().min(0).default(0),
  budget_warn_pct: z.number().min(0).max(100).default(80),
});
export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;

// ───────────────────────── Step status ─────────────────────────

export type StepStatus =
  | "pending"
  | "running"
  | "in_review"
  | "approved"
  | "rejected"
  | "skipped"
  | "resumed"
  | "failed";

export const STEP_STATUS_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  pending: ["running", "skipped"],
  running: ["in_review", "failed", "approved", "rejected"],
  in_review: ["approved", "rejected", "running"],
  approved: ["running", "rejected"],
  rejected: ["running"],
  skipped: [],
  resumed: [],
  failed: ["running"],
};

// ───────────────────────── Run state ─────────────────────────

export type ReviewVerdict = "pass" | "fail" | "cascade";

export interface ReviewResult {
  verdict: ReviewVerdict;
  reasons: string[];
  reviewer: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StepRunState {
  stepId: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  startedAtMs?: number;
  completedAtMs?: number;
  attempts: number;
  artifactPath?: string;
  outputArtifact?: string;
  reviews: ReviewResult[];
  error?: string;
  loopIteration?: number;
  revision: number;
  retriesRemaining: number;
  modelUsed: string;
  agentLabel: string;
  tokensIn: number;
  tokensOut: number;
  tokensCachedIn: number;
  costUsd: number;
  provider: string;
}

export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface PipelineRunState {
  runId: string;
  pipelineName: string;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  currentStepId?: string;
  steps: Record<string, StepRunState>;
  decisions: Decision[];
  loopFrames: LoopFrame[];
  loopGroupIterations: Record<string, number>;
  idea: string;
  title?: string;
  description?: string;
  cwd: string;
  metadata?: Record<string, unknown>;
}

// ───────────────────────── Loop frames ─────────────────────────

export interface LoopFrame {
  type: "task" | "phase" | "cascade" | "group";
  stepId: string;
  iteration: number;
  maxIterations: number;
  childStepId?: string;
}

// ───────────────────────── Decisions ─────────────────────────

export type DecisionType =
  | "step_started"
  | "step_completed"
  | "step_approved"
  | "step_rejected"
  | "step_retried"
  | "step_skipped"
  | "step_failed"
  | "run_started"
  | "run_paused"
  | "run_resumed"
  | "run_completed"
  | "run_cancelled"
  | "run_failed"
  | "auto_review_pass"
  | "auto_review_fail"
  | "user_note"
  | "cascade_reject";

export interface Decision {
  id: string;
  timestamp: string;
  type: DecisionType;
  summary: string;
  detail?: string;
  stepId?: string;
}

// ───────────────────────── Agent events ─────────────────────────

export type AgentEventType =
  | "progress"
  | "thinking"
  | "text"
  | "tool_use"
  | "tool_result"
  | "file_change"
  | "error"
  | "done"
  | "review"
  | "task_update"
  | "prompt";

export interface AgentEvent {
  type: AgentEventType;
  stepId: string;
  taskId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ───────────────────────── Artifacts ─────────────────────────

export interface ArtifactData {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface StepRunResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  tokensCachedIn: number;
  costUsd: number;
  provider: string;
  model: string;
}

// ───────────────────────── Tasks ─────────────────────────

export type TaskStatus =
  | "pending"
  | "running"
  | "passed"
  | "paused"
  | "failed"
  | "skipped";

export interface TaskItem {
  id: string;
  order: number;
  title: string;
  description: string;
  mode: "gate" | "yolo";
  status: TaskStatus;
  risk: "low" | "medium" | "high";
  files?: string[];
  dependsOn?: string[];
  requirementRefs?: string[];
}

// ───────────────────────── Agent context ─────────────────────────

export interface AgentContext {
  cwd: string;
  model: string;
  idea: string;
  artifacts: Record<string, ArtifactData>;
  tasks?: TaskItem[];
  currentTask?: TaskItem;
  skillsContext?: string;
}
