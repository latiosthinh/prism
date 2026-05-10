import React, { useMemo, useState } from "react";
import { Icon } from "./Icon.js";
import type { Decision } from "../hooks/useExtensionState.js";

interface DecisionLogProps {
  decisions: Decision[];
}

const TYPE_STYLES: Record<string, string> = {
  step_started: "bg-primary/15 text-primary border-primary/40",
  step_completed: "bg-secondary/15 text-secondary border-secondary/40",
  step_approved: "bg-secondary/15 text-secondary border-secondary/40",
  step_rejected: "bg-error/15 text-error border-error/40",
  step_retried: "bg-primary/15 text-primary border-primary/40",
  step_skipped: "bg-surface-container-high text-on-surface-variant border-outline-variant",
  step_failed: "bg-error/15 text-error border-error/40",
  cascade_reject: "bg-tertiary/15 text-tertiary border-tertiary/40",
  auto_review_pass: "bg-secondary/15 text-secondary border-secondary/40",
  auto_review_fail: "bg-tertiary/15 text-tertiary border-tertiary/40",
  run_started: "bg-primary/15 text-primary border-primary/40",
  run_paused: "bg-tertiary/15 text-tertiary border-tertiary/40",
  run_resumed: "bg-primary/15 text-primary border-primary/40",
  run_completed: "bg-secondary/15 text-secondary border-secondary/40",
  run_cancelled: "bg-surface-container-high text-on-surface-variant border-outline-variant",
  run_failed: "bg-error/15 text-error border-error/40",
  user_note: "bg-surface-container-high text-on-surface-variant border-outline-variant",
};

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
};

export const DecisionLog: React.FC<DecisionLogProps> = ({ decisions }) => {
  const allTypes = useMemo(
    () => Array.from(new Set(decisions.map((d) => d.type))).sort(),
    [decisions],
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<boolean>(true);

  const visible = useMemo(
    () => decisions.filter((d) => !hidden.has(d.type)),
    [decisions, hidden],
  );

  const toggle = (t: string): void => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <section className="bg-[#18181b] border border-[#27272a] rounded">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-md py-sm border-b border-[#27272a] flex items-center justify-between gap-md text-left hover:bg-surface-container-low transition-colors"
      >
        <div className="flex items-center gap-sm">
          <Icon
            name={collapsed ? "chevron_right" : "expand_more"}
            className="text-on-surface-variant"
            size={18}
          />
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-primary">
            Decision Log
          </span>
          <span className="font-mono-code text-[11px] text-on-surface-variant">
            ({decisions.length})
          </span>
        </div>
        {!collapsed && (
          <div
            className="flex gap-1 flex-wrap items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="text-[10px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded hover:bg-surface-container-highest"
            >
              Show all
            </button>
            <button
              type="button"
              onClick={() => setHidden(new Set(allTypes))}
              className="text-[10px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded hover:bg-surface-container-highest"
            >
              Hide all
            </button>
            {allTypes.map((t) => (
              <label
                key={t}
                className="flex items-center gap-1 text-[10px] text-on-surface-variant cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!hidden.has(t)}
                  onChange={() => toggle(t)}
                  className="accent-primary"
                />
                {t}
              </label>
            ))}
          </div>
        )}
      </button>

      {!collapsed && (
        <div className="max-h-[280px] overflow-y-auto px-md py-sm space-y-1.5 text-body-sm">
          {visible.length === 0 ? (
            <div className="text-on-surface-variant italic">
              No decisions logged.
            </div>
          ) : (
            visible.map((d) => (
              <div key={d.id} className="flex items-start gap-sm">
                <span className="font-mono-code text-[10px] text-outline shrink-0 w-16">
                  {formatTime(d.timestamp)}
                </span>
                <span
                  className={`inline-block px-1.5 py-0.5 font-label-caps text-[9px] uppercase tracking-wider rounded border shrink-0 ${
                    TYPE_STYLES[d.type] ??
                    "bg-surface-container-high text-on-surface-variant border-outline-variant"
                  }`}
                >
                  {d.type.replace(/_/g, " ")}
                </span>
                <span className="flex-1 text-on-surface break-words">
                  {d.summary}
                  {d.detail && (
                    <div className="text-[10px] text-on-surface-variant mt-0.5 whitespace-pre-wrap font-mono-code">
                      {d.detail}
                    </div>
                  )}
                </span>
                {d.stepId && (
                  <span className="shrink-0 font-mono-code text-[10px] px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded">
                    {d.stepId}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};

export default DecisionLog;
