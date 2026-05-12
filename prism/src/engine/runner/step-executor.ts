import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  PipelineDefinition,
  PipelineRunState,
  StepRunState,
  StepRunResult,
  Decision,
  ArtifactData,
  AgentEvent,
} from "../pipeline/schema.js";
import { StateMachine } from "../orchestrator/state-machine.js";
import { AutoReviewer } from "../runner/auto-reviewer.js";
import { StepRunner, RunnerOptions } from "../runner/step-runner.js";
import { AgentRegistry } from "../agents/registry.js";
import { SkillLoader } from "../artifacts/skill-loader.js";
import { appendAudit } from "../audit/audit-writer.js";
import type { StepDoneEvent, StepStartEvent } from "../audit/audit-events.js";

export interface StepExecutorConfig {
  cwd: string;
  runner: StepRunner;
  agentRegistry: AgentRegistry;
  onEvent: RunnerOptions["onEvent"];
  onDecision: (d: Decision) => void;
  signal?: AbortSignal;
}

export interface StepExecutionOutcome {
  success: boolean;
  error?: string;
  needsGate: boolean;
  verdict?: "pass" | "fail" | "cascade";
}

export class StepExecutor {
  private readonly machine: StateMachine;
  private readonly reviewer: AutoReviewer;
  private skillLoader: SkillLoader | null;

  constructor() {
    this.machine = new StateMachine();
    this.reviewer = new AutoReviewer();
    this.skillLoader = null;
  }

  initSkillLoader(cwd: string): void {
    this.skillLoader = new SkillLoader(cwd);
  }

  async executeStep(
    stepId: string,
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    stepState: StepRunState,
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    config: StepExecutorConfig,
    runDir: string,
  ): Promise<StepExecutionOutcome> {
    const { cwd, runner, agentRegistry, onEvent, signal } = config;

    const decision = (
      type: Decision["type"],
      summary: string,
      detail?: string,
      sId?: string,
    ): void => {
      config.onDecision({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type,
        summary,
        detail,
        stepId: sId,
      });
    };

    const event = (
      type: AgentEvent["type"],
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

    stepState.startedAtMs = Date.now();

    const stepStartEvent: StepStartEvent = {
      type: "step_start",
      runId: run.runId,
      ts: Date.now(),
      stepId,
      agent: stepDef.agent,
      model: stepDef.model,
      provider: "pi",
      inputSummary: (run.idea ?? "").slice(0, 100),
    };
    appendAudit(runDir, stepStartEvent);

    const artifacts = this.collectArtifacts(stepDef, pipeline, run, cwd);
    const skillsContext = this.getSkillsContext(stepDef);

    let result: StepRunResult;
    try {
      result = await runner.run(
        stepDef,
        {
          cwd,
          model: stepDef.model,
          idea: run.idea,
          artifacts,
          skillsContext,
        },
        { cwd, onEvent, signal },
      );

      stepState.tokensIn = result.tokensIn;
      stepState.tokensOut = result.tokensOut;
      stepState.tokensCachedIn = result.tokensCachedIn;
      stepState.costUsd = result.costUsd;
      stepState.provider = result.provider;
      stepState.completedAtMs = Date.now();
    } catch (err: any) {
      return this.handleRunnerError(
        stepId, stepDef, stepState, err, config, decision, event, runDir,
      );
    }

    this.writeArtifact(stepDef, run, result.text, event);

    const duration = stepState.completedAtMs
      ? stepState.completedAtMs - (stepState.startedAtMs ?? 0)
      : 0;
    const stepDoneEvent: StepDoneEvent = {
      type: "step_done",
      runId: run.runId,
      ts: Date.now(),
      stepId,
      tokensIn: stepState.tokensIn,
      tokensOut: stepState.tokensOut,
      tokensCached: stepState.tokensCachedIn,
      costUsd: stepState.costUsd,
      durationMs: duration,
      artifactPath: stepState.outputArtifact ?? "",
    };
    appendAudit(runDir, stepDoneEvent);

    return this.runReviewAndGate(
      stepId, stepDef, stepState, result.text, config, decision, event,
    );
  }

  private collectArtifacts(
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    pipeline: PipelineDefinition,
    run: PipelineRunState,
    cwd: string,
  ): Record<string, ArtifactData> {
    const agentRecord = this.getAgentSystemPrompt(stepDef, run);
    const artifacts: Record<string, ArtifactData> = {
      "system-prompt": { frontmatter: {}, body: agentRecord },
    };

    for (const prevStep of pipeline.steps) {
      if (prevStep.id === stepDef.id) break;
      const prevState = run.steps[prevStep.id];
      if (!prevState) continue;
      const artifactPath = path.join(
        cwd,
        ".PRISM",
        "runs",
        run.runId,
        "steps",
        prevStep.id,
        "latest.md",
      );
      try {
        if (fs.existsSync(artifactPath)) {
          const content = fs.readFileSync(artifactPath, "utf8");
          artifacts[prevStep.artifact || prevStep.id] = {
            frontmatter: {},
            body: content,
          };
        }
      } catch {
        /* ignore missing artifact */
      }
    }

    return artifacts;
  }

  private getAgentSystemPrompt(
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    run: PipelineRunState,
  ): string {
    const agentRegistry = (run as any)._agentRegistry as AgentRegistry | undefined;
    if (agentRegistry) {
      const record = agentRegistry.load(stepDef.agent);
      return record?.systemPrompt ?? "";
    }
    return "";
  }

  private getSkillsContext(
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
  ): string {
    if (stepDef.skills && stepDef.skills.length > 0 && this.skillLoader) {
      return this.skillLoader.buildContextForAgent(
        stepDef.skills,
        stepDef.agent,
      );
    }
    return "";
  }

  private writeArtifact(
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    run: PipelineRunState,
    text: string,
    event: (type: AgentEvent["type"], content: string, meta?: Record<string, unknown>) => void,
  ): void {
    const artifactDir = path.join(
      run.cwd,
      ".PRISM",
      "runs",
      run.runId,
      "steps",
      stepDef.id,
    );
    try {
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.writeFileSync(path.join(artifactDir, "latest.md"), text, "utf8");
      const archiveDir = path.join(artifactDir, "archive");
      fs.mkdirSync(archiveDir, { recursive: true });
      const stepState = run.steps[stepDef.id];
      fs.writeFileSync(
        path.join(archiveDir, `rev-${stepState?.revision ?? 0}.md`),
        text,
        "utf8",
      );
      if (stepState) {
        stepState.outputArtifact = path
          .join(".PRISM", "runs", run.runId, "steps", stepDef.id, "latest.md")
          .replace(/\\/g, "/");
        stepState.artifactPath = stepState.outputArtifact;
      }
    } catch (err: any) {
      event(
        "error",
        `Failed to write artifact: ${err?.message ?? err}`,
      );
    }
  }

  private handleRunnerError(
    stepId: string,
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    stepState: StepRunState,
    err: any,
    config: StepExecutorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, sId?: string) => void,
    event: (type: AgentEvent["type"], content: string, meta?: Record<string, unknown>) => void,
    _runDir: string,
  ): StepExecutionOutcome {
    const errMsg = err?.message ?? String(err);
    event("error", `Runner failed: ${errMsg}`);
    decision(
      "step_failed",
      `Step "${stepDef.name}" runner error: ${errMsg}`,
      undefined,
      stepId,
    );
    this.machine.transitionStep(
      { steps: { [stepId]: stepState } } as PipelineRunState,
      stepId,
      "failed",
    );
    stepState.error = errMsg;
    return { success: false, error: errMsg, needsGate: false };
  }

  private runReviewAndGate(
    stepId: string,
    stepDef: NonNullable<ReturnType<PipelineDefinition["steps"]["find"]>>,
    stepState: StepRunState,
    text: string,
    config: StepExecutorConfig,
    decision: (type: Decision["type"], summary: string, detail?: string, sId?: string) => void,
    event: (type: AgentEvent["type"], content: string, meta?: Record<string, unknown>) => void,
  ): StepExecutionOutcome {
    const review = this.reviewer.review(
      stepId,
      stepState,
      text,
      undefined,
      undefined,
      stepDef.tags,
      stepDef.outputSchema,
    );

    if (review instanceof Promise) {
      throw new Error("Review must be synchronous in this context");
    }

    stepState.reviews.push(review);

    const reviewSummary =
      (review.metadata?.summary as string | undefined) ??
      review.reasons.join("; ");
    const reviewDetail =
      review.reasons.length > 0 ? review.reasons.join("\n") : undefined;
    decision(
      review.verdict === "pass" ? "auto_review_pass" : "auto_review_fail",
      reviewSummary || `Auto review: ${review.verdict}`,
      reviewDetail,
      stepId,
    );

    if (review.verdict !== "pass") {
      this.machine.transitionStep(
        { steps: { [stepId]: stepState } } as PipelineRunState,
        stepId,
        "failed",
      );
      return { success: false, error: review.reasons.join("; "), needsGate: false, verdict: review.verdict as "fail" | "cascade" };
    }

    if (stepDef.gate) {
      this.machine.transitionStep(
        { steps: { [stepId]: stepState } } as PipelineRunState,
        stepId,
        "in_review",
      );
      event("progress", "Awaiting human review...");
      decision(
        "user_note",
        `Step "${stepDef.name}" awaiting human approval`,
        undefined,
        stepId,
      );
      return { success: true, needsGate: true, verdict: "pass" };
    }

    this.machine.transitionStep(
      { steps: { [stepId]: stepState } } as PipelineRunState,
      stepId,
      "approved",
    );
    return { success: true, needsGate: false, verdict: "pass" };
  }
}
