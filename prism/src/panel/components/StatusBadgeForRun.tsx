import React from "react";

interface RunStatusBadgeProps {
  status: string;
}

const STYLES: Record<string, string> = {
  idle: "bg-surface-container-high text-on-surface-variant",
  running: "bg-primary/15 text-primary border border-primary/40 animate-pulse",
  paused: "bg-tertiary/15 text-tertiary border border-tertiary/40",
  completed: "bg-secondary/15 text-secondary border border-secondary/40",
  failed: "bg-error/15 text-error border border-error/40",
  cancelled: "bg-surface-container-high text-on-surface-variant",
};

export const RunStatusBadge: React.FC<RunStatusBadgeProps> = ({ status }) => {
  const style = STYLES[status] ?? STYLES.idle;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-label-caps text-[10px] uppercase tracking-wider rounded-full ${style}`}
    >
      {status}
    </span>
  );
};

export default RunStatusBadge;
