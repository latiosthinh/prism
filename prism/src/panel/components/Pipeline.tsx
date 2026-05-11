import React, { useEffect, useMemo, useState } from "react";
import { IdeaInput, type RunMeta } from "./IdeaInput.js";
import { StepCard } from "./StepCard.js";
import { AgentStream } from "./AgentStream.js";
import { DecisionLog } from "./DecisionLog.js";
import { Icon } from "./Icon.js";
import type {
  AgentEvent,
  BridgeState,
  Decision,
} from "../hooks/useExtensionState.js";

interface PipelineProps {
  pipelineName: string;
  state: BridgeState | null;
  events: AgentEvent[];
  decisions: Decision[];
  send: (msg: Record<string, unknown>) => void;
}

const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export const Pipeline: React.FC<PipelineProps> = ({
  pipelineName,
  state,
  events,
  decisions,
  send,
}) => {
  const [submittedIdea, setSubmittedIdea] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const isRunning = state?.runStatus === "running";
  const isPaused = state?.runStatus === "paused";
  const isCompleted = state?.runStatus === "completed";
  const isFailed = state?.runStatus === "failed";
  const inReviewStep = state?.steps.find((s) => s.status === "in_review");

  useEffect(() => {
    if (isRunning && startTime === null) setStartTime(Date.now());
    if (!isRunning && !isPaused) setStartTime(null);
  }, [isRunning, isPaused, startTime]);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const completed =
    state?.steps.filter(
      (s) => s.status === "approved" || s.status === "skipped",
    ).length ?? 0;
  const total = state?.steps.length ?? 0;
  const pct = total ? (completed / total) * 100 : 0;
  const elapsed =
    startTime !== null ? formatElapsed(now - startTime) : "00:00:00";

  const stepStream: AgentEvent[] = useMemo(() => events, [events]);

  const handleRun = (meta: RunMeta): void => {
    setSubmittedIdea(meta.idea);
    setStartTime(Date.now());
    send({
      type: "startRun",
      pipeline: pipelineName,
      idea: meta.idea,
      title: meta.title,
      description: meta.description,
      customRunId: meta.title,
    });
  };

  const handleApprove = (stepId: string): void => {
    send({ type: "approveStep", stepId });
  };

  const handleReject = (stepId: string): void => {
    send({ type: "rejectStep", stepId });
  };

  const handleResume = (stepId: string): void => {
    send({ type: "resumeRun", stepId });
  };

  const handleOpenArtifact = (stepId: string): void => {
    const step = state?.steps.find((s) => s.id === stepId);
    if (!step?.outputArtifact) return;
    send({ type: "openArtifact", path: step.outputArtifact });
  };

  const handleCancel = (): void => {
    send({ type: "cancelRun" });
  };

  const runStatusLabel = isRunning
    ? "Running"
    : isPaused
      ? "Paused"
      : isCompleted
        ? "Completed"
        : isFailed
          ? "Failed"
          : "Idle";

  const runStatusClass = isRunning
    ? "text-primary animate-pulse"
    : isCompleted
      ? "text-secondary"
      : isFailed
        ? "text-error"
        : isPaused
          ? "text-tertiary"
          : "text-on-surface-variant";

  return (
    <div className="relative p-lg max-w-5xl mx-auto w-full space-y-lg">
      {/* Idea Input */}
      <IdeaInput
        onRun={handleRun}
        disabled={isRunning}
        initialValue={submittedIdea ?? state?.decisions?.[0]?.summary ?? ""}
      />

      {/* Progress Overview */}
      {state && total > 0 && (
        <section className="flex items-center gap-lg bg-surface border border-outline-variant rounded p-md">
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-end mb-xs">
              <span className="font-body-sm text-body-sm font-bold text-on-surface">
                {completed} of {total} steps complete
              </span>
              <span
                className={`font-mono-code text-[11px] uppercase tracking-wider ${runStatusClass}`}
              >
                {runStatusLabel}
              </span>
            </div>
            <div className="w-full h-[2px] bg-outline-variant rounded overflow-hidden">
              <div
                className={`h-full transition-[width] duration-500 ${
                  isFailed ? "bg-error" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="h-8 w-[1px] bg-outline-variant" />
          <div className="flex items-center gap-sm shrink-0">
            <Icon name="timer" className="text-primary" size={20} />
            <span className="font-mono-code text-body-sm tabular-nums">
              {elapsed}
            </span>
          </div>
          {isRunning && (
            <button
              type="button"
              onClick={handleCancel}
              className="ml-sm shrink-0 px-md py-xs text-body-sm font-bold rounded border border-error/40 text-error hover:bg-error/10 transition-colors"
            >
              Cancel
            </button>
          )}
        </section>
      )}

      {/* Execution Steps */}
      {state && total > 0 && (
        <section className="space-y-sm">
          <h3 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-md">
            Execution Steps
          </h3>
          <div className="space-y-sm">
            {state.steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                onOpenArtifact={handleOpenArtifact}
                onApprove={handleApprove}
                onReject={handleReject}
                onResume={handleResume}
              />
            ))}
          </div>
        </section>
      )}

      {/* Agent Stream (terminal) */}
      <AgentStream events={stepStream} />

      {/* Decision Log */}
      <DecisionLog decisions={decisions} />

      {/* Floating footer - Manual review gate */}
      {inReviewStep && (
        <div
          className="fixed bottom-md left-1/2 -translate-x-1/2 flex gap-md bg-surface border border-primary rounded p-md shadow-2xl z-40 min-w-[400px] max-w-[90vw]"
          role="dialog"
          aria-label="Manual review required"
        >
          <div className="flex-1 min-w-0">
            <p className="font-label-caps text-label-caps uppercase tracking-widest text-primary mb-xs flex items-center gap-xs">
              <Icon name="rate_review" size={14} />
              Manual Review Required
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
              Review the proposed{" "}
              <span className="text-on-surface font-bold">
                &apos;{inReviewStep.name}&apos;
              </span>{" "}
              output before proceeding.
              {inReviewStep.artifactDiff && (
                <span className="ml-sm text-[11px]">
                  <span className="text-secondary">+{inReviewStep.artifactDiff.added}</span>{" "}
                  <span className="text-error">-{inReviewStep.artifactDiff.removed}</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-sm items-center shrink-0">
            <button
              type="button"
              onClick={() => handleReject(inReviewStep.id)}
              className="bg-surface-container-highest text-on-surface px-md py-sm font-label-caps text-label-caps border border-outline-variant hover:border-error transition-colors rounded uppercase"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => handleApprove(inReviewStep.id)}
              className="bg-primary text-on-primary px-lg py-sm font-label-caps text-label-caps font-bold hover:opacity-90 transition-opacity rounded uppercase"
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pipeline;
