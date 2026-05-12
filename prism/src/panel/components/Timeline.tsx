import React, { useEffect, useState } from "react";
import { TimelineRow } from "./TimelineRow.js";

export interface TimelineStep {
  stepId: string;
  name: string;
  agent: string;
  startedAtMs?: number;
  completedAtMs?: number;
  status: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  artifactPath?: string;
  error?: string;
  condition?: string;
}

interface TimelineProps {
  steps: TimelineStep[];
  runStartMs: number;
  runDurationMs: number;
  isRunning: boolean;
  onStepClick?: (stepId: string) => void;
}

const AGENT_CATEGORY_COLORS: Record<string, string> = {
  product: "#8b5cf6",
  technical: "#f59e0b",
  quality: "#f97316",
  output: "#14b8a6",
};

const AGENT_CATEGORIES: Record<string, string> = {
  "idea-expander": "product",
  "requirements-engineer": "product",
  architect: "technical",
  "task-generator": "technical",
  executor: "technical",
  critic: "quality",
  "test-writer": "quality",
  reporter: "output",
  "security-reviewer": "quality",
  "performance-reviewer": "quality",
  "docs-writer": "output",
  "migration-planner": "technical",
};

function groupIntoRows(steps: TimelineStep[]): TimelineStep[][] {
  const sorted = [...steps].filter((s) => s.startedAtMs).sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));
  const rows: TimelineStep[][] = [];

  for (const step of sorted) {
    const stepEnd = step.completedAtMs ?? Date.now();
    let placed = false;

    for (const row of rows) {
      const overlaps = row.some((existing) => {
        const existingEnd = existing.completedAtMs ?? Date.now();
        return (step.startedAtMs ?? 0) < existingEnd && (existing.startedAtMs ?? 0) < stepEnd;
      });

      if (!overlaps) {
        row.push(step);
        placed = true;
        break;
      }
    }

    if (!placed) {
      rows.push([step]);
    }
  }

  return rows;
}

export const Timeline: React.FC<TimelineProps> = ({
  steps,
  runStartMs,
  runDurationMs,
  isRunning,
  onStepClick,
}) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const effectiveDuration = isRunning ? now - runStartMs : runDurationMs;
  const rows = groupIntoRows(steps);

  if (steps.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        No steps to display
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-300">Run Timeline</h3>
        <span className="text-xs text-zinc-500">
          {formatDuration(effectiveDuration)}
        </span>
      </div>

      <div className="relative">
        <div className="flex justify-between text-xs text-zinc-600 mb-1 px-1">
          <span>0s</span>
          <span>{formatDuration(effectiveDuration / 4)}</span>
          <span>{formatDuration(effectiveDuration / 2)}</span>
          <span>{formatDuration((effectiveDuration * 3) / 4)}</span>
          <span>{formatDuration(effectiveDuration)}</span>
        </div>

        <div className="space-y-1">
          {rows.map((row, rowIdx) => (
            <TimelineRow
              key={rowIdx}
              steps={row}
              runStartMs={runStartMs}
              runDurationMs={effectiveDuration}
              isRunning={isRunning}
              now={now}
              onStepClick={onStepClick}
              getAgentColor={(agent) => {
                const category = AGENT_CATEGORIES[agent] ?? "product";
                return AGENT_CATEGORY_COLORS[category] ?? "#8b5cf6";
              }}
            />
          ))}
        </div>

        {rows.length > 1 && (
          <div className="mt-2 text-xs text-zinc-600 italic">
            {rows.length} parallel group{rows.length > 1 ? "s" : ""} detected
          </div>
        )}
      </div>
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
