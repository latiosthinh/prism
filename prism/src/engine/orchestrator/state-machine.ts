import {
  PipelineRunState,
  PipelineDefinition,
  StepStatus,
  STEP_STATUS_TRANSITIONS,
  Decision,
  RunStatus,
  StepRunState,
} from "../pipeline/schema.js";

export class StateMachine {
  transitionStep(
    run: PipelineRunState,
    stepId: string,
    newStatus: StepStatus,
  ): void {
    const step = run.steps[stepId];
    if (!step) return;

    const allowed = STEP_STATUS_TRANSITIONS[step.status] ?? [];
    if (!allowed.includes(newStatus)) {
      console.warn(
        `[state-machine] Invalid transition for step '${stepId}': ${step.status} → ${newStatus} (allowed: ${allowed.join(", ") || "<none>"})`,
      );
      return;
    }

    step.status = newStatus;
    const now = new Date().toISOString();
    run.updatedAt = now;

    if (newStatus === "running" && !step.startedAt) {
      step.startedAt = now;
    }
    if (newStatus === "approved") {
      step.completedAt = now;
    }
  }

  isStepComplete(status: StepStatus): boolean {
    return status === "approved" || status === "skipped" || status === "resumed";
  }

  allStepsComplete(run: PipelineRunState, stepOrder: string[]): boolean {
    if (stepOrder.length === 0) return false;
    for (const id of stepOrder) {
      const step = run.steps[id];
      if (!step) return false;
      if (!this.isStepComplete(step.status)) return false;
    }
    return true;
  }

  setRunStatus(run: PipelineRunState, status: RunStatus): void {
    run.status = status;
    run.updatedAt = new Date().toISOString();
    if (status === "completed" || status === "failed" || status === "cancelled") {
      run.completedAt = run.updatedAt;
    }
  }

  addDecision(run: PipelineRunState, decision: Decision): void {
    run.decisions.push(decision);
  }

  initStepStates(pipeline: PipelineDefinition, run: PipelineRunState): void {
    for (const step of pipeline.steps) {
      const state: StepRunState = {
        stepId: step.id,
        status: "pending",
        attempts: 0,
        reviews: [],
        revision: 0,
        retriesRemaining: step.maxRetries,
        modelUsed: step.model,
        agentLabel: step.agent,
      };
      run.steps[step.id] = state;
    }
  }
}
