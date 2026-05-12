import React, { useState } from "react";
import { Timeline } from "./Timeline.js";
import { CostBreakdown } from "./CostBreakdown.js";
import { AuditLogView } from "./AuditLogView.js";
import { BudgetMeter } from "./BudgetMeter.js";
import type { TimelineStep } from "./Timeline.js";

interface AuditEvent {
  type: string;
  runId: string;
  ts: number;
  [key: string]: any;
}

interface ObservabilityPanelProps {
  steps: TimelineStep[];
  auditEvents: AuditEvent[];
  runStartMs: number;
  runDurationMs: number;
  isRunning: boolean;
  budgetUsd: number;
  onExportMarkdown?: () => void;
  onExportCsv?: () => void;
}

type Tab = "timeline" | "cost" | "audit";

export const ObservabilityPanel: React.FC<ObservabilityPanelProps> = ({
  steps,
  auditEvents,
  runStartMs,
  runDurationMs,
  isRunning,
  budgetUsd,
  onExportMarkdown,
  onExportCsv,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("timeline");

  const totalCost = steps.reduce((sum, s) => sum + s.costUsd, 0);
  const totalTokensIn = steps.reduce((sum, s) => sum + s.tokensIn, 0);
  const totalTokensOut = steps.reduce((sum, s) => sum + s.tokensOut, 0);
  const totalTokensCached = steps.reduce((sum, s) => sum + s.tokensCachedIn, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline", label: "Timeline" },
    { key: "cost", label: "Cost" },
    { key: "audit", label: "Audit" },
  ];

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-3 py-1 text-xs rounded ${
                activeTab === tab.key
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {(onExportMarkdown || onExportCsv) && (
          <div className="flex gap-1">
            {onExportMarkdown && (
              <button
                className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded"
                onClick={onExportMarkdown}
              >
                Export MD
              </button>
            )}
            {onExportCsv && (
              <button
                className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded"
                onClick={onExportCsv}
              >
                Export CSV
              </button>
            )}
          </div>
        )}
      </div>

      {budgetUsd > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800">
          <BudgetMeter spentUsd={totalCost} budgetUsd={budgetUsd} />
        </div>
      )}

      {activeTab === "timeline" && (
        <Timeline
          steps={steps}
          runStartMs={runStartMs}
          runDurationMs={runDurationMs}
          isRunning={isRunning}
        />
      )}

      {activeTab === "cost" && (
        <CostBreakdown
          steps={steps}
          totalCost={totalCost}
          totalTokensIn={totalTokensIn}
          totalTokensOut={totalTokensOut}
          totalTokensCached={totalTokensCached}
        />
      )}

      {activeTab === "audit" && (
        <AuditLogView events={auditEvents} />
      )}
    </div>
  );
};
