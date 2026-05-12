import React from "react";

interface AuditEvent {
  type: string;
  runId: string;
  ts: number;
  [key: string]: any;
}

interface AuditLogViewProps {
  events: AuditEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  run_start: "▶",
  run_done: "✅",
  run_aborted: "❌",
  step_start: "⚙",
  step_done: "✓",
  step_failed: "✗",
  step_skipped: "⏭",
  gate_open: "🔒",
  gate_closed: "🔓",
  budget_warn: "⚡",
  budget_exceeded: "⚠",
};

const EVENT_COLORS: Record<string, string> = {
  run_start: "text-green-400",
  run_done: "text-green-400",
  run_aborted: "text-red-400",
  step_start: "text-zinc-400",
  step_done: "text-zinc-300",
  step_failed: "text-red-400",
  step_skipped: "text-zinc-600",
  gate_open: "text-yellow-400",
  gate_closed: "text-yellow-400",
  budget_warn: "text-yellow-400",
  budget_exceeded: "text-red-400",
};

export const AuditLogView: React.FC<AuditLogViewProps> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        No audit events
      </div>
    );
  }

  return (
    <div className="p-4 space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
      {events.map((event, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 py-1 border-b border-zinc-800/30"
        >
          <span className={`w-4 text-center ${EVENT_COLORS[event.type] ?? "text-zinc-500"}`}>
            {EVENT_ICONS[event.type] ?? "•"}
          </span>
          <span className="text-zinc-600 whitespace-nowrap">
            {formatTime(event.ts)}
          </span>
          <span className={`font-medium ${EVENT_COLORS[event.type] ?? "text-zinc-400"}`}>
            {event.type}
          </span>
          <span className="text-zinc-500 truncate">
            {formatEventDetail(event)}
          </span>
        </div>
      ))}
    </div>
  );
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(11, 19);
}

function formatEventDetail(event: AuditEvent): string {
  const parts: string[] = [];

  if (event.stepId) parts.push(event.stepId);
  if (event.agent) parts.push(`(${event.agent})`);
  if (event.costUsd !== undefined) parts.push(`$${event.costUsd.toFixed(4)}`);
  if (event.spentUsd !== undefined) parts.push(`spent $${event.spentUsd.toFixed(4)}`);
  if (event.decision) parts.push(event.decision);
  if (event.error) parts.push(event.error.slice(0, 50));
  if (event.reason) parts.push(event.reason.slice(0, 50));
  if (event.condition) parts.push(`condition: ${event.condition}`);

  return parts.join(" ") || "";
}
