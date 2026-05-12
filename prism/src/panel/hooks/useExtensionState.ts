import { useState, useEffect, useCallback } from "react";

declare function acquireVsCodeApi(): {
  postMessage(msg: any): void;
  getState(): any;
  setState(state: any): void;
};

const vscodeApi: ReturnType<typeof acquireVsCodeApi> | null =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : null;

export interface StepStateSummary {
  id: string;
  name: string;
  agent: string;
  model: string;
  status: string;
  gate: boolean;
  revision: number;
  retriesRemaining: number;
  outputArtifact?: string;
  error?: string;
  artifactDiff?: {
    added: number;
    removed: number;
    hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: string[];
    }>;
  };
  tokensIn?: number;
  tokensOut?: number;
  tokensCachedIn?: number;
  costUsd?: number;
  provider?: string;
  startedAtMs?: number;
  completedAtMs?: number;
}

export interface TelemetryStep {
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
}

export interface AuditEvent {
  type: string;
  runId: string;
  ts: number;
  stepId?: string;
  [key: string]: any;
}

export interface BridgeState {
  pipelineName: string;
  runId: string;
  runStatus: string;
  steps: StepStateSummary[];
  currentStepId: string | null;
  decisions: Decision[];
  pipeline?: any;
}

export interface AgentEvent {
  type: string;
  stepId: string;
  taskId?: string;
  content: string;
  metadata?: any;
  timestamp: string;
}

export interface Decision {
  id: string;
  timestamp: string;
  type: string;
  summary: string;
  detail?: string;
  stepId?: string;
}

export interface PipelineSummary {
  /** File basename (== pipeline id used in handlers). */
  name: string;
  /** Human-readable name from inside the yaml (`name:` field). Falls back to the file basename. */
  displayName?: string;
  stepCount: number;
  description: string;
}

export interface RunSummary {
  runId: string;
  pipelineName: string;
  startedAt: string;
  status: string;
  title?: string;
  description?: string;
  idea?: string;
}

export function useExtensionState() {
  const [state, setState] = useState<BridgeState | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifyInFlight, setVerifyInFlight] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetrySteps, setTelemetrySteps] = useState<TelemetryStep[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [budgetUsd, setBudgetUsd] = useState(0);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (vscodeApi) {
      vscodeApi.postMessage(msg);
    } else {
      console.log("[panel:fallback] postMessage", msg);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "bootstrap":
          setPipelines(msg.pipelines || []);
          setAgents(msg.agents || []);
          setSkills(msg.skills || []);
          if (msg.state) setState(msg.state);
          setConnected(true);
          break;
        case "stateUpdate":
          setState(msg.state);
          if (msg.state?.decisions)
            setDecisions(msg.state.decisions);
          setConnected(true);
          break;
        case "agentEvent":
          setEvents((prev) => [...prev.slice(-200), msg.event]);
          break;
        case "decision":
          setDecisions((prev) => [...prev, msg.decision]);
          break;
        case "agentStatus":
        case "agentError":
          break;
        case "pipelineList":
          setPipelines(msg.pipelines || []);
          break;
        case "runList":
          setRuns(msg.runs || []);
          break;
        case "pipelineData":
          setPipelineData(msg);
          break;
        case "pipelineSaved":
          setError(null);
          break;
        case "settings":
          setSettings(msg.settings ?? null);
          break;
        case "verifyCursorSdkStarted":
          setVerifyInFlight(true);
          setVerifyResult(null);
          break;
        case "verifyCursorSdkResult":
          setVerifyInFlight(false);
          setVerifyResult(msg.result ?? null);
          break;
        case "error":
          setError(msg.message ?? "Unknown error");
          break;
        case "telemetry_update":
          if (msg.steps) setTelemetrySteps(msg.steps);
          if (msg.budgetUsd !== undefined) setBudgetUsd(msg.budgetUsd);
          break;
        case "audit_event":
          setAuditEvents((prev) => [...prev.slice(-500), msg.event]);
          break;
        case "audit_log":
          if (msg.events) setAuditEvents(msg.events);
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    send({ type: "init" });
    return () => window.removeEventListener("message", handler);
  }, [send]);

  return {
    state,
    events,
    decisions,
    pipelines,
    agents,
    skills,
    runs,
    pipelineData,
    settings,
    verifyResult,
    verifyInFlight,
    connected,
    error,
    send,
    telemetrySteps,
    auditEvents,
    budgetUsd,
  };
}
