import { v4 as uuidv4 } from "uuid";
import {
  PipelineDefinition,
  PipelineRunState,
  StepDefinition,
  StepRunState,
  TaskItem,
  Decision,
  LoopFrame,
  AgentEvent,
} from "../pipeline/schema.js";
import { StateMachine } from "../orchestrator/state-machine.js";
import { AutoReviewer } from "./auto-reviewer.js";
import { StepRunner, RunnerOptions } from "./step-runner.js";
import { AgentRegistry } from "../agents/registry.js";

export interface TaskLoopOptions {
  step: StepDefinition;
  pipeline: PipelineDefinition;
  run: PipelineRunState;
  stepState: StepRunState;
  tasks: TaskItem[];
  runner: StepRunner;
  agentRegistry: AgentRegistry;
  cwd: string;
  onEvent: RunnerOptions["onEvent"];
  signal?: AbortSignal;
  onDecision: (d: Decision) => void;
  priorCriticFeedback?: string;
}

export class LoopManager {
  private readonly machine: StateMachine;
  private readonly reviewer: AutoReviewer;

  constructor() {
    this.machine = new StateMachine();
    this.reviewer = new AutoReviewer();
  }

  async runTaskLoop(opts: TaskLoopOptions): Promise<void> {
    const {
      step,
      pipeline: _pipeline,
      run,
      stepState,
      tasks,
      runner,
      agentRegistry,
      cwd,
      onEvent,
      signal,
      onDecision,
      priorCriticFeedback,
    } = opts;

    const loopAgent = step.loop?.agent ?? "critic";
    const maxIterations = step.loop?.maxIterations ?? 3;

    const frame: LoopFrame = {
      type: "task",
      stepId: step.id,
      iteration: 0,
      maxIterations,
    };
    run.loopFrames.push(frame);

    const emit = (
      type: AgentEvent["type"],
      content: string,
      meta?: Record<string, unknown>,
    ): void => {
      onEvent({
        type,
        stepId: step.id,
        content,
        metadata: meta,
        timestamp: new Date().toISOString(),
      });
    };

    let allDone = true;

    for (const task of tasks) {
      if (task.status === "passed" || task.status === "paused") continue;
      if (signal?.aborted) {
        allDone = false;
        break;
      }

      const accumulatedFeedback: string[] = [];
      if (priorCriticFeedback && priorCriticFeedback.trim()) {
        accumulatedFeedback.push(`Carry-over: ${priorCriticFeedback.trim()}`);
      }
      let taskAttempts = 0;
      let taskPassed = false;

      while (taskAttempts < maxIterations) {
        if (signal?.aborted) break;
        taskAttempts++;
        frame.iteration = taskAttempts;
        frame.childStepId = task.id;

        const feedbackContext = accumulatedFeedback.length
          ? [
              `Previous ${accumulatedFeedback.length} attempt(s) were rejected. Feedback from ALL prior rounds:`,
              ...accumulatedFeedback.map((f, i) => `  ${i + 1}. ${f}`),
              "Address ALL of the above feedback in your next attempt.",
            ].join("\n")
          : "";

        emit(
          "progress",
          `Task ${task.id}: ${task.title} — attempt ${taskAttempts}/${maxIterations}`,
          { taskId: task.id, attempt: taskAttempts },
        );

        task.status = "running";

        const executorAgent = agentRegistry.load(step.agent);
        const executorPrompt = executorAgent?.systemPrompt ?? "";

        let taskOutput = "";
        try {
          taskOutput = await runner.run(
            step,
            {
              cwd,
              model: step.model,
              idea: feedbackContext
                ? `${run.idea}\n\n---\n\n${feedbackContext}`
                : run.idea,
              artifacts: {
                "system-prompt": { frontmatter: {}, body: executorPrompt },
              },
              tasks,
              currentTask: task,
            },
            { cwd, onEvent, signal },
          );
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          accumulatedFeedback.push(
            `Attempt ${taskAttempts}: runner threw: ${msg}`,
          );
          task.status = "failed";
          onDecision({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            type: "step_failed",
            summary: `Task ${task.id} attempt ${taskAttempts} failed: ${msg}`,
            stepId: step.id,
          });
          continue;
        }

        const criticAgent = agentRegistry.load(loopAgent);
        const criticPrompt = criticAgent?.systemPrompt ?? "";

        let criticOutput = "";
        try {
          criticOutput = await runner.run(
            { ...step, id: `${step.id}__critic`, agent: loopAgent },
            {
              cwd,
              model: step.model,
              idea: run.idea,
              artifacts: {
                "system-prompt": { frontmatter: {}, body: criticPrompt },
                "task-output": { frontmatter: {}, body: taskOutput },
              },
              tasks,
              currentTask: task,
            },
            { cwd, onEvent, signal },
          );
        } catch (err: any) {
          const msg = err?.message ?? String(err);
          accumulatedFeedback.push(
            `Attempt ${taskAttempts}: critic threw: ${msg}`,
          );
          task.status = "failed";
          continue;
        }

        const review = await this.reviewer.review(
          step.id,
          stepState,
          criticOutput,
          undefined,
          undefined,
          step.tags,
        );

        const passed = review.verdict === "pass" &&
          /\bPASS\b/i.test(criticOutput);

        if (passed) {
          task.status = task.mode === "gate" ? "paused" : "passed";
          taskPassed = true;
          onDecision({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            type: "step_approved",
            summary: `Task ${task.id} passed on attempt ${taskAttempts}`,
            stepId: step.id,
          });
          break;
        } else {
          const summary =
            (review.metadata?.summary as string | undefined) ??
            review.reasons.join("; ") ??
            "rejected";
          accumulatedFeedback.push(
            `Attempt ${taskAttempts}: ${summary} | critic: ${criticOutput.slice(0, 500)}`,
          );
          task.status = "failed";
          onDecision({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            type: "step_rejected",
            summary: `Task ${task.id} attempt ${taskAttempts} rejected`,
            detail: summary,
            stepId: step.id,
          });
        }
      }

      if (!taskPassed) {
        allDone = false;
        emit(
          "error",
          `Task ${task.id} exhausted ${maxIterations} attempts without passing — manual intervention needed`,
        );
      }
    }

    const lastFrame = run.loopFrames[run.loopFrames.length - 1];
    if (lastFrame && lastFrame.stepId === step.id) {
      run.loopFrames.pop();
    }

    if (allDone) {
      this.machine.transitionStep(
        run,
        step.id,
        step.gate ? "in_review" : "approved",
      );
    } else {
      this.machine.transitionStep(run, step.id, "failed");
    }
  }
}
