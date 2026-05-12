import React from "react";
import { TimelineBar } from "./TimelineBar.js";
import type { TimelineStep } from "./Timeline.js";

interface TimelineRowProps {
  steps: TimelineStep[];
  runStartMs: number;
  runDurationMs: number;
  isRunning: boolean;
  now: number;
  onStepClick?: (stepId: string) => void;
  getAgentColor: (agent: string) => string;
}

export const TimelineRow: React.FC<TimelineRowProps> = ({
  steps,
  runStartMs,
  runDurationMs,
  isRunning,
  now,
  onStepClick,
  getAgentColor,
}) => {
  return (
    <div className="relative h-8 flex items-center">
      {steps.map((step) => (
        <TimelineBar
          key={step.stepId}
          step={step}
          runStartMs={runStartMs}
          runDurationMs={runDurationMs}
          isRunning={isRunning}
          now={now}
          onClick={onStepClick}
          color={getAgentColor(step.agent)}
        />
      ))}
      {steps.length > 1 && (
        <div className="absolute -bottom-3 left-0 right-0 flex justify-center">
          <span className="text-[10px] text-zinc-600">ran in parallel</span>
        </div>
      )}
    </div>
  );
};
