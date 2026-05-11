import { PipelineRunState, StepStatus } from "./schema.js";

export type ConditionExpression = string;

export function evaluateCondition(
  expr: ConditionExpression,
  run: PipelineRunState,
): boolean {
  const trimmed = expr.trim();

  if (!trimmed) return true;

  if (trimmed.startsWith("gate:")) {
    return evaluateGateCondition(trimmed.slice(5).trim(), run);
  }

  if (trimmed.startsWith("var:")) {
    return evaluateVarCondition(trimmed.slice(4).trim(), run);
  }

  if (trimmed === "gate_approved") {
    return evaluateGateApproved(run);
  }

  if (trimmed === "gate_rejected") {
    return !evaluateGateApproved(run);
  }

  return evaluateStepStatusCondition(trimmed, run);
}

function evaluateGateCondition(rest: string, run: PipelineRunState): boolean {
  const parts = rest.split(/\s+/);
  const stepId = parts[0];
  const expectedStatus = parts[1] ?? "approved";

  const stepState = run.steps[stepId];
  if (!stepState) return false;

  return stepState.status === expectedStatus;
}

function evaluateVarCondition(rest: string, run: PipelineRunState): boolean {
  const eqIdx = rest.indexOf("=");
  if (eqIdx < 0) return false;

  const key = rest.slice(0, eqIdx).trim();
  const expectedValue = rest.slice(eqIdx + 1).trim();

  const metadata = run.metadata ?? {};
  const actualValue = metadata[key];

  if (actualValue === undefined) return false;

  return String(actualValue) === expectedValue;
}

function evaluateGateApproved(run: PipelineRunState): boolean {
  const currentStepId = run.currentStepId;
  if (!currentStepId) return false;

  const stepState = run.steps[currentStepId];
  if (!stepState) return false;

  return stepState.status === "approved";
}

function evaluateStepStatusCondition(
  expr: string,
  run: PipelineRunState,
): boolean {
  const parts = expr.split(/\s+/);
  const stepId = parts[0];
  const expectedStatus = parts[1] as StepStatus | undefined;

  const stepState = run.steps[stepId];
  if (!stepState) return false;

  if (!expectedStatus) {
    return stepState.status === "approved" || stepState.status === "skipped";
  }

  return stepState.status === expectedStatus;
}
