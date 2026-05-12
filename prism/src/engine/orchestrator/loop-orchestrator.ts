import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  PipelineDefinition,
  PipelineRunState,
  StepRunState,
  Decision,
  LoopGroup,
  TaskItem,
  ArtifactData,
  AgentEvent,
} from "../pipeline/schema.js";
import { StateMachine } from "./state-machine.js";
import { LoopManager } from "../runner/loop-manager.js";
import { CascadeRejector } from "../runner/cascade-reject.js";
import { AutoReviewer } from "../runner/auto-reviewer.js";
import { StepRunner, RunnerOptions } from "../runner/step-runner.js";
import { AgentRegistry } from "../agents/registry.js";
import { PipelineValidator } from "../pipeline/validator.js";
import { SkillLoader } from "../artifacts/skill-loader.js";
import { evaluateCondition } from "../pipeline/conditions.js";
import { PrismBudgetError } from "../errors/budget-error.js";
import { appendAudit, ensureRunDir } from "../audit/audit-writer.js";
import { StepExecutor } from "../runner/step-executor.js";
import type {
  RunStartEvent,
  RunDoneEvent,
  StepStartEvent,
  StepDoneEvent,
  StepFailedEvent,
  StepSkippedEvent,
  BudgetWarnEvent,
  BudgetExceededEvent,
} from "../audit/audit-events.js";

export interface OrchestratorConfig {
  cwd: string;
  runner: StepRunner;
  agentRegistry: AgentRegistry;
  onEvent: RunnerOptions["onEvent"];
  onDecision: (d: Decision) => void;
  waitForGate: (stepId: string) => Promise<void>;
  signal?: AbortSignal;
}

interface StepExecutionResult {
  stepId: string;
  success: boolean;
  error?: string;
  needsGate: boolean;
  gateApproved?: boolean;
  reviewVerdict?: "pass" | "fail" | "cascade";
}

export class LoopOrchestrator {
  private readonly machine: StateMachine;
  private readonly validator: PipelineValidator;
  private readonly loopManager: LoopManager;
  private readonly cascadeRejector: CascadeRejector;
  private readonly reviewer: AutoReviewer;
  private readonly stepExecutor: StepExecutor;
  private skillLoader: SkillLoader | null;

  constructor() {
    this.machine = new StateMachine();
    this.validator = new PipelineValidator();
    this.loopManager = new LoopManager();
    this.cascadeRejector = new CascadeRejector();
    this.reviewer = new AutoReviewer();
    this.stepExecutor = new StepExecutor();
    this.skillLoader = null;
  }

  async run(
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: OrchestratorConfig,
    resumeFromStep?: string,
  ): Promise<void> {
    const {
      cwd,
      runner,
      agentRegistry,
      onEvent,
      onDecision,
      waitForGate,
      signal,
    } = config;

    this.skillLoader = new SkillLoader(cwd);
    this.stepExecutor.initSkillLoader(cwd);

    const decision = (
      type: Decision["type"],
      summary: string,
      detail?: string,
      stepId?: string,
    ): void => {
      onDecision({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type,
        summary,
        detail,
        stepId,
      });
    };

    const event = (
      type: AgentEvent["type"],
      stepId: string,
      content: string,
      meta?: Record<string, unknown>,
    ): void => {
      onEvent({
        type,
        stepId,
        content,
        metadata: meta,
        timestamp: new Date().toISOString(),
      });
    };

    if (!run.loopGroupIterations) run.loopGroupIterations = {};

    const issues = this.validator.validate(pipeline);
    const errors = issues.filter((i) => i.type === "error");
    if (errors.length > 0) {
      this.machine.setRunStatus(run, "failed");
      decision(
        "run_failed",
        `Validation failed: ${errors.map((e) => e.message).join("; ")}`,
      );
      return;
    }

    const isParallel = pipeline.execution?.mode === "parallel";

    if (isParallel) {
      await this.runParallel(
        pipeline,
        run,
        { cwd, runner, agentRegistry, onEvent, onDecision, waitForGate, signal },
        decision,
        event,
        resumeFromStep,
      );
    } else {
      await this.runSequential(
        pipeline,
        run,
        { cwd, runner, agentRegistry, onEvent, onDecision, waitForGate, signal },
        decision,
        event,
        resumeFromStep,
      );
    }

    const order = this.getOrder(pipeline);
    if (this.machine.allStepsComplete(run, order)) {
      this.machine.setRunStatus(run, "completed");
      decision("run_completed", `Pipeline "${pipeline.name}" completed`);
      const runDir = path.join(config.cwd, ".PRISM", "runs", run.runId);
      const totalCost = this.totalRunCost(run);
      const totalTokens = Object.values(run.steps).reduce((sum, s) => sum + (s.tokensIn ?? 0) + (s.tokensOut ?? 0), 0);
      const duration = run.completedAt ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime() : Date.now() - new Date(run.startedAt).getTime();
      const runDoneEvent: RunDoneEvent = {
        type: "run_done",
        runId: run.runId,
        ts: Date.now(),
        totalCost,
        totalTokens,
        durationMs: duration,
        exitStatus: "completed",
      };
      appendAudit(runDir, runDoneEvent);
    } else {
      this.machine.setRunStatus(run, "paused");
      decision("run_paused", `Pipeline "${pipeline.name}" paused`);
    }
  }

  private getOrder(pipeline: PipelineDefinition): string[] {
    try {
      return this.validator.topologicalSort(pipeline);
    } catch {
      return pipeline.steps.map((s) => s.id);
    }
  }

  private async runParallel(
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: OrchestratorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, stepId?: string) => void,
    event: (type: AgentEvent["type"], stepId: string, content: string, meta?: Record<string, unknown>) => void,
    resumeFromStep?: string,
  ): Promise<void> {
    const { signal, cwd } = config;
    const runDir = path.join(cwd, ".PRISM", "runs", run.runId);
    const groups = this.validator.findParallelGroups(pipeline);

    let resumeGroupIdx = 0;
    if (resumeFromStep) {
      for (let g = 0; g < groups.length; g++) {
        if (groups[g].includes(resumeFromStep)) {
          resumeGroupIdx = g;
          for (let j = 0; j < g; j++) {
            for (const sid of groups[j]) {
              const s = run.steps[sid];
              if (s && !this.machine.isStepComplete(s.status)) {
                s.status = "resumed";
              }
            }
          }
          break;
        }
      }
    }

    for (let g = resumeGroupIdx; g < groups.length; g++) {
      if (signal?.aborted) {
        this.machine.setRunStatus(run, "cancelled");
        decision("run_cancelled", "Pipeline cancelled by user");
        return;
      }

      const warnEmitted = { value: false };
      try {
        this.checkBudget(run, pipeline, runDir, decision, warnEmitted);
      } catch (err) {
        if (err instanceof PrismBudgetError) {
          this.machine.setRunStatus(run, "failed");
          return;
        }
        throw err;
      }

      const budgetUsd = pipeline.budget_usd ?? 0;
      if (budgetUsd > 0) {
        const spent = this.totalRunCost(run);
        const groupSteps = groups[g].filter((sid) => {
          const s = run.steps[sid];
          return s && !this.machine.isStepComplete(s.status);
        });
        let estimatedGroupCost = 0;
        for (const sid of groupSteps) {
          const stepDef = pipeline.steps.find((s) => s.id === sid);
          estimatedGroupCost += this.estimateStepCost(stepDef);
        }
        if (spent + estimatedGroupCost > budgetUsd) {
          decision(
            "run_failed",
            `Budget exceeded: parallel group would exceed budget (spent $${spent.toFixed(4)} + est $${estimatedGroupCost.toFixed(4)} > $${budgetUsd.toFixed(2)})`,
          );
          this.machine.setRunStatus(run, "failed");
          return;
        }
      }

      const group = groups[g].filter((sid) => {
        const s = run.steps[sid];
        return s && !this.machine.isStepComplete(s.status);
      });

      if (group.length === 0) continue;

      const skippedByCondition = groups[g].filter((sid) => {
        const stepDef = pipeline.steps.find((s) => s.id === sid);
        if (!stepDef?.condition) return false;
        const shouldRun = evaluateCondition(stepDef.condition, run);
        return !shouldRun;
      });

      for (const sid of skippedByCondition) {
        const s = run.steps[sid];
        if (s && s.status === "pending") {
          this.machine.transitionStep(run, sid, "skipped");
          decision("step_skipped", `Step "${sid}" skipped by condition`, undefined, sid);
        }
      }

      const executableSteps = group.filter((sid) => {
        const stepDef = pipeline.steps.find((s) => s.id === sid);
        if (!stepDef?.condition) return true;
        return evaluateCondition(stepDef.condition, run);
      });

      if (executableSteps.length === 0) continue;

      decision(
        "user_note",
        `Executing parallel group ${g + 1}/${groups.length} (${executableSteps.length} steps)`,
      );

      const results = await this.executeParallelGroup(
        executableSteps,
        pipeline,
        run,
        config,
        decision,
        event,
        runDir,
      );

      const failedStep = results.find((r) => !r.success);
      if (failedStep) {
        const stepDef = pipeline.steps.find((s) => s.id === failedStep.stepId);
        decision(
          "step_rejected",
          `Step "${stepDef?.name ?? failedStep.stepId}" failed in parallel group`,
          failedStep.error,
          failedStep.stepId,
        );
        this.machine.setRunStatus(run, "failed");
        decision("run_failed", `Pipeline failed at step "${failedStep.stepId}"`);
        return;
      }
    }
  }

  private async executeParallelGroup(
    stepIds: string[],
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: OrchestratorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, stepId?: string) => void,
    event: (type: AgentEvent["type"], stepId: string, content: string, meta?: Record<string, unknown>) => void,
    runDir: string,
  ): Promise<StepExecutionResult[]> {
    const { waitForGate } = config;

    const promises = stepIds.map(async (stepId): Promise<StepExecutionResult> => {
      const stepDef = pipeline.steps.find((s) => s.id === stepId);
      const stepState = run.steps[stepId];
      if (!stepDef || !stepState) {
        return { stepId, success: true, needsGate: false };
      }

      if (this.machine.isStepComplete(stepState.status)) {
        return { stepId, success: true, needsGate: false };
      }

      if (stepState.status === "rejected") {
        stepState.retriesRemaining = stepDef.maxRetries;
        this.machine.transitionStep(run, stepId, "running");
      } else if (stepState.status === "pending") {
        stepState.revision++;
        this.machine.transitionStep(run, stepId, "running");
      }
      stepState.startedAtMs = Date.now();

      return this.executeSingleStep(
        stepId,
        stepDef,
        stepState,
        pipeline,
        run,
        config,
        decision,
        event,
        runDir,
      );
    });

    const results = await Promise.all(promises);

    const gateSteps = results.filter((r) => r.needsGate);
    if (gateSteps.length > 0) {
      await Promise.all(
        gateSteps.map(async (r) => {
          await waitForGate(r.stepId);
          const stepState = run.steps[r.stepId];
          r.gateApproved = stepState.status === "approved";
        }),
      );
    }

    return results;
  }

  private async executeSingleStep(
    stepId: string,
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    stepState: StepRunState,
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: OrchestratorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, stepId?: string) => void,
    event: (type: AgentEvent["type"], stepId: string, content: string, meta?: Record<string, unknown>) => void,
    runDir: string,
  ): Promise<StepExecutionResult> {
    const { cwd, runner, agentRegistry, onEvent, onDecision, signal } = config;

    const outcome = await this.stepExecutor.executeStep(
      stepId,
      stepDef,
      stepState,
      pipeline,
      run,
      { cwd, runner, agentRegistry, onEvent, onDecision, signal },
      runDir,
    );

    if (!outcome.success) {
      if (stepState.retriesRemaining > 0) {
        stepState.retriesRemaining--;
        const attempt = stepDef.maxRetries - stepState.retriesRemaining;
        const delayMs = stepDef.retryDelayMs > 0
          ? stepDef.retryDelayMs * Math.pow(stepDef.retryBackoffMultiplier ?? 2, attempt - 1)
          : 0;
        event(
          "progress",
          stepId,
          `Retrying in ${delayMs}ms (${stepState.retriesRemaining} retries left)...`,
        );
        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
        return this.executeSingleStep(stepId, stepDef, stepState, pipeline, run, config, decision, event, runDir);
      }
      return { stepId, success: false, error: outcome.error, needsGate: false, reviewVerdict: "fail" };
    }

    if (outcome.needsGate) {
      return { stepId, success: true, needsGate: true, reviewVerdict: "pass" };
    }

    return { stepId, success: true, needsGate: false, reviewVerdict: outcome.verdict === "pass" ? "pass" : "fail" };
  }

  private async runSequential(
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: OrchestratorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, stepId?: string) => void,
    event: (type: AgentEvent["type"], stepId: string, content: string, meta?: Record<string, unknown>) => void,
    resumeFromStep?: string,
  ): Promise<void> {
    const {
      cwd,
      runner,
      agentRegistry,
      onEvent,
      onDecision,
      waitForGate,
      signal,
    } = config;

    let order: string[];
    try {
      order = this.validator.topologicalSort(pipeline);
    } catch (e: any) {
      this.machine.setRunStatus(run, "failed");
      decision("run_failed", e?.message ?? String(e));
      return;
    }

    this.machine.setRunStatus(run, "running");
    decision(
      "run_started",
      `Pipeline "${pipeline.name}" started (${order.length} steps)`,
    );

    const runDir = path.join(cwd, ".PRISM", "runs", run.runId);
    ensureRunDir(runDir);
    const runStartEvent: RunStartEvent = {
      type: "run_start",
      runId: run.runId,
      ts: Date.now(),
      pipeline: pipeline.name,
      stepCount: order.length,
      budgetUsd: pipeline.budget_usd ?? 0,
      userIdentity: "local",
    };
    appendAudit(runDir, runStartEvent);

    let resumeIdx = 0;
    if (resumeFromStep) {
      const idx = order.indexOf(resumeFromStep);
      if (idx >= 0) {
        resumeIdx = idx;
        for (let j = 0; j < resumeIdx; j++) {
          const sid = order[j];
          const s = run.steps[sid];
          if (s && !this.machine.isStepComplete(s.status)) {
            s.status = "resumed";
          }
        }
        decision(
          "user_note",
          `Resuming from step "${resumeFromStep}" (skipped ${resumeIdx} steps)`,
        );
      }
    }

    let i = resumeIdx;
    const warnEmitted = { value: false };
    while (i < order.length) {
      if (signal?.aborted) {
        this.machine.setRunStatus(run, "cancelled");
        decision("run_cancelled", "Pipeline cancelled by user");
        return;
      }

      try {
        this.checkBudget(run, pipeline, runDir, decision, warnEmitted);
      } catch (err) {
        if (err instanceof PrismBudgetError) {
          this.machine.setRunStatus(run, "failed");
          return;
        }
        throw err;
      }

      const stepId = order[i];
      const stepDef = pipeline.steps.find((s) => s.id === stepId);
      if (!stepDef) {
        i++;
        continue;
      }
      const stepState = run.steps[stepId];
      if (!stepState) {
        i++;
        continue;
      }

      if (this.machine.isStepComplete(stepState.status)) {
        i++;
        continue;
      }

      if (stepDef.condition) {
        const shouldRun = evaluateCondition(stepDef.condition, run);
        if (!shouldRun) {
          this.machine.transitionStep(run, stepId, "skipped");
          decision("step_skipped", `Step "${stepDef.name}" skipped by condition`, undefined, stepId);
          const skipEvent: StepSkippedEvent = {
            type: "step_skipped",
            runId: run.runId,
            ts: Date.now(),
            stepId,
            condition: stepDef.condition!,
          };
          appendAudit(runDir, skipEvent);
          i++;
          continue;
        }
      }

      if (stepState.status === "rejected") {
        stepState.retriesRemaining = stepDef.maxRetries;
        this.machine.transitionStep(run, stepId, "running");
      } else if (stepState.status === "pending") {
        stepState.revision++;
        this.machine.transitionStep(run, stepId, "running");
      }
      stepState.startedAtMs = Date.now();

      const stepStartEvent: StepStartEvent = {
        type: "step_start",
        runId: run.runId,
        ts: Date.now(),
        stepId,
        agent: stepDef.agent,
        model: stepDef.model,
        provider: "pi",
        inputSummary: (context.idea ?? "").slice(0, 100),
      };
      appendAudit(runDir, stepStartEvent);

      if (stepDef.loop?.mode === "task") {
        const tasks = this.parseTasks(run);
        if (tasks.length > 0) {
          await this.loopManager.runTaskLoop({
            step: stepDef,
            pipeline,
            run,
            stepState,
            tasks,
            runner,
            agentRegistry,
            cwd,
            onEvent,
            signal,
            onDecision,
          });

          const allPassed = tasks.every(
            (t) => t.status === "passed" || t.status === "paused",
          );
          if (!allPassed && stepState.status !== "approved") {
            const target = this.cascadeRejector.findRollbackTarget(
              stepId,
              pipeline,
            );
            if (
              this.cascadeRejector.canCascade(run, stepId, target, pipeline)
            ) {
              this.cascadeRejector.cascadeReject(
                run,
                stepId,
                target,
                "Task loop failed: some tasks did not pass",
                pipeline,
              );
              const targetIdx = order.indexOf(target);
              if (targetIdx >= 0) i = targetIdx;
              continue;
            }
          }
          i++;
          continue;
        }
      }

      const stepResult = await this.executeSingleStep(
        stepId,
        stepDef,
        stepState,
        pipeline,
        run,
        config,
        decision,
        event,
        runDir,
      );

      if (!stepResult.success) {
        decision(
          "step_rejected",
          `Step failed after exhausting retries: ${stepResult.error}`,
          undefined,
          stepId,
        );
        this.machine.setRunStatus(run, "failed");
        decision("run_failed", `Pipeline failed at step "${stepDef.name}"`);
        return;
      }

      if (stepResult.reviewVerdict !== "pass" && stepDef.loop?.mode === "phase") {
        const prevStepId = order[Math.max(0, i - 1)];
        if (
          prevStepId !== stepId &&
          this.cascadeRejector.canCascade(run, stepId, prevStepId, pipeline)
        ) {
          const loopConfig = stepDef.loop;
          const phaseAttempts = run.loopFrames.filter(
            (f) => f.stepId === stepId && f.type === "phase",
          ).length;

          if (phaseAttempts < (loopConfig.maxIterations ?? 3)) {
            run.loopFrames.push({
              type: "phase",
              stepId,
              iteration: phaseAttempts + 1,
              maxIterations: loopConfig.maxIterations ?? 3,
            });
            this.cascadeRejector.cascadeReject(
              run,
              stepId,
              prevStepId,
              "Phase loop: cascade back",
              pipeline,
            );
            i = Math.max(0, i - 1);
            continue;
          }
        }
      }

      if (stepResult.reviewVerdict === "cascade") {
        const target =
          stepDef.loop?.target ?? (i > 0 ? order[i - 1] : order[0]);
        if (
          target !== stepId &&
          this.cascadeRejector.canCascade(run, stepId, target, pipeline)
        ) {
          this.cascadeRejector.cascadeReject(
            run,
            stepId,
            target,
            "Cascade reject verdict",
            pipeline,
          );
          const targetIdx = order.indexOf(target);
          if (targetIdx >= 0) i = targetIdx;
          continue;
        }
      }

      if (stepDef.gate && stepResult.reviewVerdict === "pass") {
        this.machine.transitionStep(run, stepId, "in_review");
        event("progress", stepId, "Awaiting human review...");
        decision(
          "user_note",
          `Step "${stepDef.name}" awaiting human approval`,
          undefined,
          stepId,
        );
        await waitForGate(stepId);
        if (signal?.aborted) {
          this.machine.setRunStatus(run, "cancelled");
          return;
        }
        if (run.steps[stepId].status !== "approved") {
          if (run.steps[stepId].status === "rejected") {
            continue;
          }
          this.machine.transitionStep(run, stepId, "approved");
        }
      } else if (stepResult.reviewVerdict === "pass") {
        this.machine.transitionStep(run, stepId, "approved");
      } else {
        this.machine.transitionStep(run, stepId, "failed");
        decision(
          "step_rejected",
          `Step "${stepDef.name}" failed after exhausting retries`,
          undefined,
          stepId,
        );
        this.machine.setRunStatus(run, "failed");
        decision("run_failed", `Pipeline failed at step "${stepDef.name}"`);
        return;
      }

      const group = this.findLoopGroupForStep(stepId, pipeline);
      if (group) {
        const lastStepId = group.steps[group.steps.length - 1];
        const firstStepId = group.steps[0];
        if (stepId === lastStepId) {
          const allPassed = group.steps.every((sid) => {
            const s = run.steps[sid];
            return s && (s.status === "approved" || s.status === "skipped");
          });
          const groupKey = group.name;
          const iterations = run.loopGroupIterations[groupKey] ?? 0;

          if (allPassed) {
            decision(
              "user_note",
              `Loop group "${groupKey}" passed after ${iterations + 1} iteration(s)`,
            );
            run.loopGroupIterations[groupKey] = 0;
          } else if (iterations < group.maxIterations - 1) {
            run.loopGroupIterations[groupKey] = iterations + 1;
            for (const sid of group.steps) {
              const s = run.steps[sid];
              if (s && s.status !== "approved" && s.status !== "skipped") {
                s.status = "pending";
                s.retriesRemaining =
                  pipeline.steps.find((ps) => ps.id === sid)?.maxRetries ?? 3;
              }
            }
            const firstIdx = order.indexOf(firstStepId);
            if (firstIdx >= 0) {
              i = firstIdx;
              continue;
            }
          } else {
            decision(
              "step_rejected",
              `Loop group "${groupKey}" failed after ${group.maxIterations} iterations`,
              undefined,
              stepId,
            );
            this.machine.setRunStatus(run, "failed");
            decision("run_failed", `Loop group "${groupKey}" exhausted`);
            return;
          }
        }
      }

      i++;
    }
  }

  private parseTasks(run: PipelineRunState): TaskItem[] {
    const tasks: TaskItem[] = [];
    let counter = 0;
    for (const state of Object.values(run.steps)) {
      if (!state.outputArtifact) continue;
      const fullPath = path.isAbsolute(state.outputArtifact)
        ? state.outputArtifact
        : path.join(run.cwd, state.outputArtifact);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, "utf8");
        const parsed = this.parseMarkdownTasks(content, counter);
        counter += parsed.length;
        tasks.push(...parsed);
      } catch {
        /* skip */
      }
    }
    return tasks;
  }

  private parseMarkdownTasks(
    markdown: string,
    startOrder = 0,
  ): TaskItem[] {
    const stripped = this.stripFrontmatter(markdown);
    const re = /^\s*[-*]\s+\[([ x])\]\s+(.+)$/gm;
    const out: TaskItem[] = [];
    let match: RegExpExecArray | null;
    let order = startOrder;
    while ((match = re.exec(stripped)) !== null) {
      const checked = match[1].toLowerCase() === "x";
      const title = match[2].trim();
      const modeMatch = title.match(/\((gate|yolo)\)/i);
      const riskMatch = title.match(/\(risk:(low|medium|high)\)/i);
      const mode = (modeMatch?.[1]?.toLowerCase() as "gate" | "yolo") || "yolo";
      const risk =
        (riskMatch?.[1]?.toLowerCase() as "low" | "medium" | "high") || "low";
      order++;
      const id = `task-${String(order).padStart(3, "0")}`;
      out.push({
        id,
        order,
        title,
        description: title,
        mode,
        status: checked ? "passed" : "pending",
        risk,
      });
    }
    return out;
  }

  private stripFrontmatter(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  private findLoopGroupForStep(
    stepId: string,
    pipeline: PipelineDefinition,
  ): LoopGroup | null {
    for (const group of pipeline.loop_groups) {
      if (group.steps.includes(stepId)) return group;
    }
    return null;
  }

  private totalRunCost(run: PipelineRunState): number {
    let total = 0;
    for (const step of Object.values(run.steps)) {
      total += step.costUsd ?? 0;
    }
    return total;
  }

  private checkBudget(
    run: PipelineRunState,
    pipeline: PipelineDefinition,
    runDir: string,
    decision: (type: Decision["type"], summary: string, detail?: string, stepId?: string) => void,
    warnEmitted: { value: boolean },
  ): void {
    const budgetUsd = pipeline.budget_usd ?? 0;
    if (budgetUsd <= 0) return;

    const spent = this.totalRunCost(run);
    const warnPct = (pipeline.budget_warn_pct ?? 80) / 100;
    const remaining = budgetUsd - spent;

    if (spent >= budgetUsd) {
      const budgetExceededEvent: BudgetExceededEvent = {
        type: "budget_exceeded",
        runId: run.runId,
        ts: Date.now(),
        spentUsd: spent,
        budgetUsd,
      };
      appendAudit(runDir, budgetExceededEvent);
      decision(
        "run_failed",
        `Budget exceeded: spent $${spent.toFixed(4)} of $${budgetUsd.toFixed(2)} budget`,
        `Remaining: $${remaining.toFixed(4)}`,
      );
      throw new PrismBudgetError(
        `Run aborted: spent $${spent.toFixed(4)} exceeds budget of $${budgetUsd.toFixed(2)}`,
        spent,
        budgetUsd,
      );
    }

    if (!warnEmitted.value && spent >= budgetUsd * warnPct) {
      warnEmitted.value = true;
      const budgetWarnEvent: BudgetWarnEvent = {
        type: "budget_warn",
        runId: run.runId,
        ts: Date.now(),
        spentUsd: spent,
        budgetUsd,
        pct: (spent / budgetUsd) * 100,
      };
      appendAudit(runDir, budgetWarnEvent);
      decision(
        "user_note",
        `Budget warning: spent $${spent.toFixed(4)} of $${budgetUsd.toFixed(2)} (${((spent / budgetUsd) * 100).toFixed(0)}%)`,
        `Remaining: $${remaining.toFixed(4)}`,
      );
    }
  }

  private estimateStepCost(stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>): number {
    const defaults: Record<string, number> = {
      "idea-expander": 0.05,
      "requirements-engineer": 0.06,
      architect: 0.08,
      "task-generator": 0.04,
      executor: 0.12,
      critic: 0.05,
      "test-writer": 0.04,
      reporter: 0.06,
      "security-reviewer": 0.07,
      "performance-reviewer": 0.06,
      "docs-writer": 0.05,
      "migration-planner": 0.07,
    };
    return stepDef?.budget_usd ?? defaults[stepDef?.agent ?? ""] ?? 0.05;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
