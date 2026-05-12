import React, { useState } from "react";
import type { TimelineStep } from "./Timeline.js";

interface TimelineBarProps {
  step: TimelineStep;
  runStartMs: number;
  runDurationMs: number;
  isRunning: boolean;
  now: number;
  onClick?: (stepId: string) => void;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  approved: "opacity-100",
  completed: "opacity-100",
  running: "animate-pulse",
  failed: "opacity-60",
  rejected: "opacity-40",
  skipped: "opacity-30",
  pending: "opacity-20",
};

export const TimelineBar: React.FC<TimelineBarProps> = ({
  step,
  runStartMs,
  runDurationMs,
  isRunning,
  now,
  onClick,
  color,
}) => {
  const [hovered, setHovered] = useState(false);

  const startedAt = step.startedAtMs ?? runStartMs;
  const completedAt = step.completedAtMs ?? (isRunning ? now : runStartMs + runDurationMs);

  const leftPct = Math.max(0, ((startedAt - runStartMs) / runDurationMs) * 100);
  const widthPct = Math.max(2, ((completedAt - startedAt) / runDurationMs) * 100);

  const duration = completedAt - startedAt;

  const statusClass = STATUS_COLORS[step.status] ?? "opacity-100";

  return (
    <div
      className={`absolute h-6 rounded-sm cursor-pointer transition-opacity ${statusClass}`}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: color,
        minWidth: "4px",
      }}
      onClick={() => onClick?.(step.stepId)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={step.name}
    >
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300 whitespace-nowrap z-10 shadow-lg border border-zinc-700">
          <div className="font-medium">{step.name}</div>
          <div>{step.agent} · {formatDuration(duration)}</div>
          <div>
            {step.tokensIn.toLocaleString()} in / {step.tokensOut.toLocaleString()} out
          </div>
          <div>${step.costUsd.toFixed(4)}</div>
          {step.status === "skipped" && step.condition && (
            <div className="text-zinc-500">Skipped: {step.condition}</div>
          )}
          {step.error && <div className="text-red-400">{step.error}</div>}
        </div>
      )}
    </div>
  );
};

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
