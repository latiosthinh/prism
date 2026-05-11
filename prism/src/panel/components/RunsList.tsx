import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { useExtensionState, type RunSummary } from "../hooks/useExtensionState.js";
import { StatusBadge } from "./StatusBadge.js";
import { RunStatusBadge } from "./StatusBadgeForRun.js";
import { Icon } from "./Icon.js";

type DetailTab = "steps" | "events" | "decisions";

interface LoggedEvent {
  type: string;
  stepId: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface RunsListProps {
  /**
   * Called when the user clicks Re-run, BEFORE the startRun message is sent.
   * Lets the parent navigate to the live run view so the user can see progress.
   */
  onRerun?: (run: RunSummary) => void;
  /** Switch to the live run view for the given pipeline. */
  onOpenLive?: (pipelineName: string) => void;
  /** Open the global "Start Run" modal (pipeline picker + idea prompt). */
  onStartRun?: () => void;
}

export const RunsList: React.FC<RunsListProps> = ({
  onRerun: onRerunNav,
  onOpenLive,
  onStartRun,
}) => {
  const { runs, send, state } = useExtensionState();
  const activeRunId = state?.runId ?? null;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runState, setRunState] = useState<any | null>(null);
  const [stepLog, setStepLog] = useState<{
    stepId: string;
    content: string;
  } | null>(null);
  const [stepPrompt, setStepPrompt] = useState<{
    stepId: string;
    content: string;
  } | null>(null);
  const [stepView, setStepView] = useState<"artifact" | "prompt">("artifact");
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [detailTab, setDetailTab] = useState<DetailTab>("steps");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    send({ type: "listRuns" });
  }, [send]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === "runState") setRunState(msg.state);
      if (msg.type === "stepLog")
        setStepLog({ stepId: msg.stepId, content: msg.content ?? "" });
      if (msg.type === "stepPrompt")
        setStepPrompt({ stepId: msg.stepId, content: msg.content ?? "" });
      if (msg.type === "runEvents") setEvents(msg.events ?? []);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleExpand = (id: string): void => {
    if (expanded === id) {
      setExpanded(null);
      setRunState(null);
      setStepLog(null);
      setStepPrompt(null);
      setEvents([]);
      setDetailTab("steps");
      return;
    }
    setExpanded(id);
    setRunState(null);
    setStepLog(null);
    setStepPrompt(null);
    setEvents([]);
    setDetailTab("steps");
    send({ type: "selectRun", runId: id });
    send({ type: "getRunEvents", runId: id });
  };

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((r) =>
      [r.runId, r.pipelineName, r.title, r.description, r.idea]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [runs, filter]);

  return (
    <div className="p-lg max-w-5xl mx-auto space-y-md">
      <div className="flex justify-between items-end gap-md flex-wrap">
        <div>
          <p className="text-primary font-label-caps text-label-caps uppercase tracking-widest mb-xs">
            Execution History
          </p>
          <h2 className="font-headline-sm text-[28px] font-bold text-on-surface leading-none">
            Runs
            <span className="ml-sm text-body-sm text-on-surface-variant font-normal align-middle">
              ({runs.length})
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-sm">
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by ID, title, description"
              className="bg-background border border-outline-variant rounded pl-lg pr-sm py-xs text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none w-64 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => send({ type: "listRuns" })}
            className="border border-outline-variant text-on-surface-variant hover:border-primary hover:text-on-surface px-md py-xs rounded font-bold text-body-sm transition-colors flex items-center gap-xs"
          >
            <Icon name="refresh" size={16} />
            Refresh
          </button>
          {onStartRun && (
            <button
              type="button"
              onClick={onStartRun}
              className="bg-primary text-on-primary px-md py-xs rounded font-bold text-body-sm flex items-center gap-xs hover:opacity-90 transition-opacity"
              title="Pick a pipeline and start a new run"
            >
              <Icon name="play_arrow" filled size={16} />
              Start Run
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded p-md text-body-sm text-on-surface-variant">
          {runs.length === 0
            ? "No runs yet - start a pipeline run to see history here."
            : "No runs match your filter."}
        </div>
      ) : (
        <div className="space-y-sm">
          {filtered.map((r) => (
            <RunCard
              key={r.runId}
              run={r}
              expanded={expanded === r.runId}
              runState={expanded === r.runId ? runState : null}
              stepLog={expanded === r.runId ? stepLog : null}
              stepPrompt={expanded === r.runId ? stepPrompt : null}
              stepView={stepView}
              onStepViewChange={setStepView}
              events={expanded === r.runId ? events : []}
              detailTab={detailTab}
              onTabChange={setDetailTab}
              onToggle={() => handleExpand(r.runId)}
              onLoadStep={(stepId) => {
                send({ type: "getStepLog", runId: r.runId, stepId });
                send({ type: "getStepPrompt", runId: r.runId, stepId });
              }}
              onRerun={() => {
                // Navigate to the live run view first so the user sees the
                // pipeline kick off; otherwise it looks like nothing happened.
                onRerunNav?.(r);
                send({
                  type: "startRun",
                  pipeline: r.pipelineName,
                  idea: r.idea,
                  title: r.title ? `${r.title} (rerun)` : undefined,
                  description: r.description,
                });
              }}
              onResume={() => send({ type: "resumeRun" })}
              onApproveStep={(stepId) => send({ type: "approveStep", stepId })}
              onRejectStep={(stepId) => send({ type: "rejectStep", stepId })}
              onOpenLive={() => onOpenLive?.(r.pipelineName)}
              isActiveRun={activeRunId === r.runId}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface RunCardProps {
  run: RunSummary;
  expanded: boolean;
  runState: any | null;
  stepLog: { stepId: string; content: string } | null;
  stepPrompt: { stepId: string; content: string } | null;
  stepView: "artifact" | "prompt";
  onStepViewChange: (v: "artifact" | "prompt") => void;
  events: LoggedEvent[];
  detailTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onToggle: () => void;
  onLoadStep: (stepId: string) => void;
  onRerun: () => void;
  onResume: () => void;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  onOpenLive: () => void;
  isActiveRun: boolean;
  formatDate: (iso: string) => string;
}

const RunCard: React.FC<RunCardProps> = ({
  run,
  expanded,
  runState,
  stepLog,
  stepPrompt,
  stepView,
  onStepViewChange,
  events,
  detailTab,
  onTabChange,
  onToggle,
  onLoadStep,
  onRerun,
  onResume,
  onApproveStep,
  onRejectStep,
  onOpenLive,
  isActiveRun,
  formatDate,
}) => {
  const renderedMarkdown = stepLog
    ? (marked.parse(stepLog.content || "_(empty artifact)_", {
        async: false,
      }) as string)
    : "";

  const isRunning = run.status === "running";
  const headerLabel = run.title || run.idea?.slice(0, 60) || run.runId;
  const decisions: any[] = runState?.decisions ?? [];

  return (
    <div
      className={[
        "bg-[#18181b] border border-[#27272a] rounded overflow-hidden transition-colors",
        isRunning ? "pulse-running" : "",
      ].join(" ")}
    >
      <div
        className="flex items-center justify-between gap-md px-md py-sm cursor-pointer hover:bg-surface-container-low"
        onClick={onToggle}
      >
        <div className="flex items-center gap-md min-w-0 flex-1">
          <Icon
            name={expanded ? "expand_more" : "chevron_right"}
            className="text-on-surface-variant"
            size={18}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-sm flex-wrap">
              <span className="text-body-md font-bold text-on-surface truncate">
                {headerLabel}
              </span>
              <span className="text-[10px] font-mono-code text-on-surface-variant px-1.5 py-0.5 bg-surface-container-high rounded">
                {run.pipelineName}
              </span>
              <RunStatusBadge status={run.status} />
            </div>
            {run.description && (
              <div className="text-[12px] text-on-surface-variant truncate mt-0.5">
                {run.description}
              </div>
            )}
            <div className="text-[11px] font-mono-code text-outline truncate mt-0.5">
              {run.runId} &middot; {formatDate(run.startedAt)}
            </div>
          </div>
        </div>
        <div
          className="flex gap-sm shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onRerun}
            className="border border-[#27272a] text-on-surface-variant hover:border-primary hover:text-on-surface px-md py-1.5 rounded font-bold text-body-sm transition-colors flex items-center gap-xs"
            title="Start a new run with the same idea"
          >
            <Icon name="replay" size={16} />
            Re-run
          </button>
          {run.status === "paused" && (
            <button
              type="button"
              onClick={onResume}
              className="bg-tertiary text-on-tertiary px-md py-1.5 rounded font-bold text-body-sm hover:opacity-90 transition-opacity flex items-center gap-xs"
            >
              <Icon name="play_arrow" filled size={16} />
              Resume
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-md pb-md space-y-sm border-t border-[#27272a] pt-md">
          {!runState ? (
            <div className="text-body-sm text-on-surface-variant py-xs">
              Loading run...
            </div>
          ) : (
            <>
              {run.idea && (
                <div className="p-sm bg-surface-container-lowest border border-outline-variant rounded">
                  <div className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
                    Idea
                  </div>
                  <div className="text-body-sm text-on-surface whitespace-pre-wrap">
                    {run.idea}
                  </div>
                </div>
              )}

              <div className="flex gap-1 border-b border-[#27272a]">
                {(["steps", "events", "decisions"] as DetailTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTabChange(t)}
                    className={`px-md py-xs text-body-sm font-bold rounded-t transition-colors ${
                      detailTab === t
                        ? "bg-surface-container-high text-on-surface"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {t === "steps" && "Steps"}
                    {t === "events" && `Events (${events.length})`}
                    {t === "decisions" && `Decisions (${decisions.length})`}
                  </button>
                ))}
              </div>

              {detailTab === "steps" && (
                <div className="space-y-1">
                  {(() => {
                    const allSteps = Object.values<any>(runState.steps ?? {});
                    const inReview = allSteps.find(
                      (s) => s.status === "in_review",
                    );
                    if (!inReview) return null;
                    return (
                      <div className="flex items-start gap-sm bg-tertiary/10 border border-tertiary/40 text-on-surface rounded p-sm mb-xs">
                        <Icon
                          name="rate_review"
                          className="text-tertiary mt-0.5 shrink-0"
                          size={18}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-body-sm">
                            Manual review required
                          </div>
                          <div className="text-[12px] text-on-surface-variant mt-0.5 truncate">
                            Step{" "}
                            <span className="font-mono-code">
                              {inReview.stepId}
                            </span>{" "}
                            is paused for human approval.
                            {!isActiveRun && (
                              <>
                                {" "}
                                Approve / reject acts on the currently active
                                run only — open it live first.
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-xs shrink-0">
                          {!isActiveRun && (
                            <button
                              type="button"
                              onClick={onOpenLive}
                              className="px-md py-1 text-[11px] font-bold uppercase tracking-wider rounded border border-outline-variant text-on-surface hover:border-primary transition-colors"
                              title="Open the live run view"
                            >
                              Open Live
                            </button>
                          )}
                          {isActiveRun && (
                            <>
                              <button
                                type="button"
                                onClick={() => onRejectStep(inReview.stepId)}
                                className="px-md py-1 text-[11px] font-bold uppercase tracking-wider rounded border border-outline-variant text-on-surface hover:border-error transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => onApproveStep(inReview.stepId)}
                                className="px-md py-1 text-[11px] font-bold uppercase tracking-wider rounded bg-primary text-on-primary hover:opacity-90 transition-opacity"
                              >
                                Approve
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {Object.values<any>(runState.steps ?? {}).map((s) => (
                    <div
                      key={s.stepId}
                      className="flex items-center gap-sm bg-surface border border-outline-variant rounded hover:border-primary transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onLoadStep(s.stepId)}
                        className="flex-1 text-left flex items-center gap-md px-sm py-xs min-w-0"
                      >
                        <StatusBadge status={s.status} />
                        <span className="text-body-sm text-on-surface truncate flex-1">
                          {s.stepId}
                        </span>
                        {s.revision > 1 && (
                          <span className="text-[10px] font-mono-code text-on-surface-variant">
                            R{s.revision}
                          </span>
                        )}
                      </button>
                      {s.status === "in_review" && isActiveRun && (
                        <div className="flex gap-1 pr-sm shrink-0">
                          <button
                            type="button"
                            onClick={() => onRejectStep(s.stepId)}
                            className="px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-outline-variant text-on-surface hover:border-error transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => onApproveStep(s.stepId)}
                            className="px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-primary text-on-primary hover:opacity-90 transition-opacity"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {(stepLog || stepPrompt) && (
                    <div className="bg-surface-container-lowest border border-outline-variant rounded mt-2 overflow-hidden">
                      <div className="flex items-center justify-between gap-md px-sm py-xs border-b border-outline-variant">
                        <div className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant flex items-center gap-xs">
                          <Icon name="description" size={14} />
                          {stepView === "artifact" ? "Artifact" : "Prompt"}:{" "}
                          {stepLog?.stepId || stepPrompt?.stepId}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onStepViewChange("artifact")}
                            className={`px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                              stepView === "artifact"
                                ? "bg-primary text-on-primary"
                                : "text-on-surface-variant hover:text-on-surface"
                            }`}
                          >
                            Artifact
                          </button>
                          <button
                            type="button"
                            onClick={() => onStepViewChange("prompt")}
                            className={`px-sm py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                              stepView === "prompt"
                                ? "bg-primary text-on-primary"
                                : "text-on-surface-variant hover:text-on-surface"
                            }`}
                          >
                            Prompt
                          </button>
                        </div>
                      </div>
                      <div className="p-md max-h-[400px] overflow-auto">
                        {stepView === "artifact" ? (
                          <div
                            className="prose prose-invert prose-sm max-w-none text-on-surface [&>*]:my-2"
                            dangerouslySetInnerHTML={{
                              __html: renderedMarkdown,
                            }}
                          />
                        ) : (
                          <pre className="font-mono-code text-[11px] text-on-surface whitespace-pre-wrap break-words">
                            {stepPrompt?.content?.trim() ||
                              "(no prompt recorded for this step yet)"}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "events" && (
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-sm max-h-[500px] overflow-auto font-mono-code text-[11px]">
                  {events.length === 0 ? (
                    <div className="text-on-surface-variant p-xs">
                      No events logged for this run.
                    </div>
                  ) : (
                    events.map((ev, i) => (
                      <div
                        key={i}
                        className="px-sm py-1 border-b border-outline-variant/50 last:border-b-0"
                      >
                        <span className="text-outline">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>{" "}
                        <span className="text-tertiary">[{ev.stepId}]</span>{" "}
                        <span className="text-secondary">{ev.type}</span>
                        {ev.content && (
                          <div className="text-on-surface whitespace-pre-wrap break-words mt-0.5">
                            {ev.content.length > 600
                              ? ev.content.slice(0, 600) + "\u2026"
                              : ev.content}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === "decisions" && (
                <div className="bg-surface-container-lowest border border-outline-variant rounded p-sm max-h-[500px] overflow-auto text-[11px]">
                  {decisions.length === 0 ? (
                    <div className="text-on-surface-variant p-xs">
                      No decisions recorded.
                    </div>
                  ) : (
                    decisions.map((d) => (
                      <div
                        key={d.id}
                        className="px-sm py-1.5 border-b border-outline-variant/50 last:border-b-0"
                      >
                        <div className="flex items-center gap-sm">
                          <span className="text-outline font-mono-code">
                            {new Date(d.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-secondary font-bold">
                            {d.type}
                          </span>
                          {d.stepId && (
                            <span className="text-tertiary font-mono-code">
                              [{d.stepId}]
                            </span>
                          )}
                        </div>
                        <div className="text-on-surface mt-0.5">{d.summary}</div>
                        {d.detail && (
                          <div className="text-on-surface-variant text-[10px] mt-0.5 whitespace-pre-wrap font-mono-code">
                            {d.detail}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RunsList;
