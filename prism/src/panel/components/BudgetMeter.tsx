import React from "react";

interface BudgetMeterProps {
  spentUsd: number;
  budgetUsd: number;
  showLabel?: boolean;
}

export const BudgetMeter: React.FC<BudgetMeterProps> = ({
  spentUsd,
  budgetUsd,
  showLabel = true,
}) => {
  if (budgetUsd <= 0) return null;

  const pct = Math.min(100, (spentUsd / budgetUsd) * 100);
  const remaining = budgetUsd - spentUsd;

  let bgColor = "bg-green-600";
  let textColor = "text-green-400";
  let icon = "";

  if (pct >= 100) {
    bgColor = "bg-red-600";
    textColor = "text-red-400";
    icon = "⚠️ ";
  } else if (pct >= 80) {
    bgColor = "bg-yellow-600";
    textColor = "text-yellow-400";
    icon = "⚡ ";
  }

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Budget</span>
          <span className={textColor}>
            {icon}${spentUsd.toFixed(4)} / ${budgetUsd.toFixed(2)}
          </span>
        </div>
      )}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${bgColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && remaining > 0 && (
        <div className="text-xs text-zinc-600">
          ${remaining.toFixed(4)} remaining
        </div>
      )}
      {pct >= 100 && (
        <div className="text-xs text-red-400 font-medium">
          Budget exceeded
        </div>
      )}
    </div>
  );
};
