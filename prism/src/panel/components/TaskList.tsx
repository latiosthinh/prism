import React from "react";

export interface TaskItem {
  id: string;
  order: number;
  title: string;
  description?: string;
  mode: "gate" | "yolo";
  status: "pending" | "running" | "passed" | "paused" | "failed" | "skipped";
  risk: "low" | "medium" | "high";
  files?: string[];
}

interface TaskListProps {
  tasks: TaskItem[];
  onToggle?: (taskId: string) => void;
}

const RISK_DOT: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

const MODE_BADGE: Record<string, string> = {
  gate: "bg-amber-700 text-amber-100",
  yolo: "bg-zinc-700 text-zinc-300",
};

const StatusIcon: React.FC<{ status: TaskItem["status"] }> = ({ status }) => {
  if (status === "passed")
    return <span className="text-emerald-400">☑</span>;
  if (status === "running")
    return <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
  if (status === "failed") return <span className="text-red-400">✗</span>;
  if (status === "paused") return <span className="text-amber-400">⏸</span>;
  if (status === "skipped") return <span className="text-zinc-500">↷</span>;
  return <span className="text-zinc-500">☐</span>;
};

export const TaskList: React.FC<TaskListProps> = ({ tasks, onToggle }) => {
  if (tasks.length === 0) {
    return (
      <div className="text-[11px] text-zinc-500 italic p-2">
        No tasks parsed for this step.
      </div>
    );
  }
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  return (
    <ul className="space-y-1.5">
      {ordered.map((t) => (
        <li
          key={t.id}
          onClick={() => onToggle?.(t.id)}
          className={`flex items-center gap-2 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-[12px] ${onToggle ? "cursor-pointer hover:border-zinc-700" : ""}`}
        >
          <StatusIcon status={t.status} />
          <span
            className={`inline-block w-2 h-2 rounded-full ${RISK_DOT[t.risk] ?? "bg-zinc-500"}`}
            title={`Risk: ${t.risk}`}
          />
          <span className="font-medium text-zinc-100 flex-1 truncate">
            {t.title}
          </span>
          <span
            className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded ${MODE_BADGE[t.mode]}`}
          >
            {t.mode}
          </span>
          <span className="text-[10px] text-zinc-500 capitalize w-12 text-right">
            {t.status}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default TaskList;
