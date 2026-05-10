import React from "react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Pill-shaped status indicator. Colors map directly to the design system
 * tokens (success / running / review / error) with subtle tinted backgrounds.
 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-surface-container-high text-on-surface-variant",
  running: "bg-primary/15 text-primary border border-primary/40",
  in_review: "bg-tertiary/15 text-tertiary border border-tertiary/40",
  approved: "bg-secondary/15 text-secondary border border-secondary/40",
  rejected: "bg-error/15 text-error border border-error/40",
  failed: "bg-error/15 text-error border border-error/40",
  skipped: "bg-surface-container-high text-on-surface-variant",
};

const formatStatus = (status: string): string =>
  status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = "",
}) => {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-label-caps text-[10px] uppercase tracking-wider rounded-full ${style} ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
};

export default StatusBadge;
