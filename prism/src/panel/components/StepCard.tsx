import React from "react";
import { Icon } from "./Icon.js";
import type { StepStateSummary } from "../hooks/useExtensionState.js";

interface StepCardProps {
  step: StepStateSummary;
  /** 0..1 progress for running steps. */
  progress?: number;
  onOpenArtifact?: (stepId: string) => void;
  onApprove?: (stepId: string) => void;
  onReject?: (stepId: string) => void;
  onResume?: (stepId: string) => void;
}

interface StatusVisual {
  icon: string;
  iconClass: string;
  label: string;
  spin?: boolean;
  trailing: string;
  trailingClass: string;
}

const VISUALS: Record<string, StatusVisual> = {
  pending: {
    icon: "pending",
    iconClass: "text-outline",
    label: "Pending",
    trailing: "PENDING",
    trailingClass: "text-outline",
  },
  running: {
    icon: "sync",
    iconClass: "text-primary",
    spin: true,
    label: "Running",
    trailing: "RUNNING",
    trailingClass: "text-primary",
  },
  in_review: {
    icon: "rate_review",
    iconClass: "text-tertiary",
    label: "Review",
    trailing: "REVIEW",
    trailingClass: "text-tertiary",
  },
  approved: {
    icon: "check_circle",
    iconClass: "text-secondary",
    label: "Success",
    trailing: "SUCCESS",
    trailingClass: "text-outline",
  },
  rejected: {
    icon: "cancel",
    iconClass: "text-error",
    label: "Rejected",
    trailing: "REJECTED",
    trailingClass: "text-error",
  },
  failed: {
    icon: "error",
    iconClass: "text-error",
    label: "Failed",
    trailing: "FAILED",
    trailingClass: "text-error",
  },
  resumed: {
    icon: "fast_forward",
    iconClass: "text-outline",
    label: "Resumed",
    trailing: "RESUMED",
    trailingClass: "text-outline",
  },
};

export const StepCard: React.FC<StepCardProps> = ({
  step,
  progress,
  onOpenArtifact,
  onApprove,
  onReject,
  onResume,
}) => {
  const visual = VISUALS[step.status] ?? VISUALS.pending;
  const isRunning = step.status === "running";
  const isPending = step.status === "pending";
  const inReview = step.status === "in_review";
  const isFailedOrRejected = step.status === "failed" || step.status === "rejected";
  const clickable =
    !!step.outputArtifact && typeof onOpenArtifact === "function";

  const containerClasses = [
    "border border-outline-variant rounded p-md flex flex-col gap-sm transition-colors",
    isRunning
      ? "bg-surface-container-high pulse-running"
      : "bg-surface hover:bg-surface-container-low",
    isPending ? "opacity-50" : "",
    clickable ? "cursor-pointer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (): void => {
    if (clickable) onOpenArtifact?.(step.id);
  };

  const pct =
    isRunning && typeof progress === "number"
      ? Math.max(0, Math.min(1, progress)) * 100
      : null;

  return (
    <div onClick={handleClick} className={containerClasses}>
      <div className="flex items-center justify-between gap-md">
        <div className="flex items-center gap-md min-w-0 flex-1">
          <Icon
            name={visual.icon}
            className={`${visual.iconClass} ${visual.spin ? "animate-spin" : ""}`}
            size={20}
          />
          <div className="min-w-0">
            <p
              className={`font-body-md text-body-md font-bold truncate ${
                isPending ? "text-outline" : "text-on-surface"
              }`}
            >
              {step.name}
              {step.gate && (
                <Icon
                  name="lock"
                  size={14}
                  className="ml-xs text-on-surface-variant align-middle"
                  title="Gate (requires approval)"
                />
              )}
              {step.revision > 1 && (
                <span className="ml-sm text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded font-mono-code">
                  R{step.revision}
                </span>
              )}
            </p>
            <p
              className={`text-[12px] ${
                isPending ? "text-outline" : "text-on-surface-variant"
              } truncate`}
            >
              {step.agent}
              <span className="opacity-50"> &middot; {step.model}</span>
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-xs">
          <span
            className={`font-mono-code text-[11px] tracking-wider ${visual.trailingClass}`}
          >
            {visual.trailing}
          </span>
          {!isPending && (
            <span className="text-[10px] text-on-surface-variant font-mono-code">
              {step.retriesRemaining}/3 retries
            </span>
          )}
        </div>
      </div>

      {/* Determinate progress bar - only when running */}
      {isRunning && (
        <div className="w-full h-1 bg-surface-container-highest rounded overflow-hidden">
          <div
            className={
              pct === null
                ? "h-full w-1/3 bg-primary animate-pulse"
                : "h-full bg-primary transition-[width] duration-300"
            }
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
      )}

      {step.error && (
        <div className="font-mono-code text-mono-code text-error bg-error/10 border border-error/30 rounded px-sm py-xs whitespace-pre-wrap break-words">
          {step.error}
        </div>
      )}

      {isFailedOrRejected && onResume && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onResume(step.id)}
            className="px-md py-xs font-label-caps text-label-caps uppercase bg-[#3b82f6] text-white rounded font-bold hover:opacity-90 transition-opacity flex items-center gap-xs"
          >
            <Icon name="replay" size={14} />
            Resume from here
          </button>
        </div>
      )}

      {inReview && (onApprove || onReject) && (
        <div className="flex gap-sm" onClick={(e) => e.stopPropagation()}>
          {onReject && (
            <button
              type="button"
              onClick={() => onReject(step.id)}
              className="px-md py-xs font-label-caps text-label-caps uppercase bg-surface-container-highest text-on-surface border border-outline-variant hover:border-error transition-colors rounded"
            >
              Reject
            </button>
          )}
          {onApprove && (
            <button
              type="button"
              onClick={() => onApprove(step.id)}
              className="px-md py-xs font-label-caps text-label-caps uppercase bg-primary text-on-primary font-bold hover:opacity-90 transition-opacity rounded"
            >
              Approve
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StepCard;
