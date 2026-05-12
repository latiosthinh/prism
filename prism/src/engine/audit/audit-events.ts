export type AuditEventType =
  | "run_start"
  | "run_done"
  | "run_aborted"
  | "step_start"
  | "step_done"
  | "step_failed"
  | "step_skipped"
  | "gate_open"
  | "gate_closed"
  | "budget_warn"
  | "budget_exceeded";

interface AuditEventBase {
  type: AuditEventType;
  runId: string;
  ts: number;
}

export interface RunStartEvent extends AuditEventBase {
  type: "run_start";
  pipeline: string;
  stepCount: number;
  budgetUsd: number;
  userIdentity: string;
}

export interface RunDoneEvent extends AuditEventBase {
  type: "run_done";
  totalCost: number;
  totalTokens: number;
  durationMs: number;
  exitStatus: "completed" | "failed" | "cancelled";
}

export interface RunAbortedEvent extends AuditEventBase {
  type: "run_aborted";
  reason: string;
}

export interface StepStartEvent extends AuditEventBase {
  type: "step_start";
  stepId: string;
  agent: string;
  model: string;
  provider: string;
  inputSummary: string;
}

export interface StepDoneEvent extends AuditEventBase {
  type: "step_done";
  stepId: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd: number;
  durationMs: number;
  artifactPath: string;
}

export interface StepFailedEvent extends AuditEventBase {
  type: "step_failed";
  stepId: string;
  error: string;
  attempt: number;
  willRetry: boolean;
}

export interface StepSkippedEvent extends AuditEventBase {
  type: "step_skipped";
  stepId: string;
  condition: string;
}

export interface GateOpenEvent extends AuditEventBase {
  type: "gate_open";
  stepId: string;
  artifactPath: string;
}

export interface GateClosedEvent extends AuditEventBase {
  type: "gate_closed";
  stepId: string;
  decision: "approved" | "rejected";
  userComment?: string;
  waitDurationMs: number;
}

export interface BudgetWarnEvent extends AuditEventBase {
  type: "budget_warn";
  spentUsd: number;
  budgetUsd: number;
  pct: number;
}

export interface BudgetExceededEvent extends AuditEventBase {
  type: "budget_exceeded";
  spentUsd: number;
  budgetUsd: number;
  stepId?: string;
}

export type AuditEvent =
  | RunStartEvent
  | RunDoneEvent
  | RunAbortedEvent
  | StepStartEvent
  | StepDoneEvent
  | StepFailedEvent
  | StepSkippedEvent
  | GateOpenEvent
  | GateClosedEvent
  | BudgetWarnEvent
  | BudgetExceededEvent;
