import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon.js";
import type { PipelineSummary } from "../hooks/useExtensionState.js";

export interface StartRunPayload {
  pipelineName: string;
  idea: string;
  title?: string;
  description?: string;
}

interface StartRunModalProps {
  open: boolean;
  pipelines: PipelineSummary[];
  /** File basename to preselect, if any. */
  initialPipeline?: string | null;
  onSubmit: (payload: StartRunPayload) => void;
  onClose: () => void;
}

export const StartRunModal: React.FC<StartRunModalProps> = ({
  open,
  pipelines,
  initialPipeline,
  onSubmit,
  onClose,
}) => {
  const [pipelineName, setPipelineName] = useState<string>(
    initialPipeline ?? pipelines[0]?.name ?? "",
  );
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showMeta, setShowMeta] = useState(false);
  const ideaRef = useRef<HTMLTextAreaElement | null>(null);

  // Whenever the modal opens, prime selection + focus the idea field.
  useEffect(() => {
    if (!open) return;
    setPipelineName(initialPipeline ?? pipelines[0]?.name ?? "");
    setIdea("");
    setTitle("");
    setDescription("");
    setShowMeta(false);
    const t = window.setTimeout(() => ideaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialPipeline, pipelines]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idea, title, description, pipelineName]);

  const sortedPipelines = useMemo(
    () =>
      [...pipelines].sort((a, b) =>
        (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name),
      ),
    [pipelines],
  );

  const selected = sortedPipelines.find((p) => p.name === pipelineName);
  const canSubmit = !!pipelineName && idea.trim().length > 0;

  const submit = (): void => {
    if (!canSubmit) return;
    onSubmit({
      pipelineName,
      idea: idea.trim(),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  if (!open) return null;

  const inputClass =
    "w-full bg-background border border-outline-variant rounded px-md py-sm text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-outline-variant rounded shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-md px-lg py-md border-b border-outline-variant">
          <div className="flex items-center gap-sm min-w-0">
            <Icon name="play_circle" className="text-primary" size={22} />
            <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
              Start a new run
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-on-surface-variant hover:text-on-surface p-xs"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-lg space-y-md">
          {sortedPipelines.length === 0 ? (
            <div className="bg-surface-container-low border border-outline-variant rounded p-md text-body-sm text-on-surface-variant">
              No pipelines yet — create one from the Pipelines tab first.
            </div>
          ) : (
            <>
              <div>
                <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
                  Pipeline
                </label>
                <select
                  value={pipelineName}
                  onChange={(e) => setPipelineName(e.target.value)}
                  className={inputClass}
                >
                  {sortedPipelines.map((p) => (
                    <option key={p.name} value={p.name}>
                      {(p.displayName ?? p.name) +
                        (p.displayName && p.displayName !== p.name
                          ? ` — ${p.name}`
                          : "")}
                      {`  (${p.stepCount} step${p.stepCount === 1 ? "" : "s"})`}
                    </option>
                  ))}
                </select>
                {selected?.description && (
                  <div className="text-[11px] text-on-surface-variant mt-xs truncate">
                    {selected.description}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-xs">
                  <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
                    Idea / Prompt
                  </label>
                  <span className="text-[11px] font-mono-code text-outline">
                    {idea.length}
                  </span>
                </div>
                <textarea
                  ref={ideaRef}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={6}
                  placeholder="Describe what you want this run to do..."
                  className="w-full bg-background border border-outline-variant rounded p-md font-mono-code text-mono-code text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[140px] resize-y transition-colors"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowMeta((v) => !v)}
                  className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors"
                >
                  {showMeta
                    ? "Hide title & description"
                    : "+ Add title & description (optional)"}
                </button>
                {showMeta && (
                  <div className="mt-sm flex flex-col gap-sm">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Title / Run ID — e.g. EPIC-173"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Description"
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-md px-lg py-md border-t border-outline-variant">
          <span className="text-[11px] text-on-surface-variant">
            <kbd className="font-mono-code px-1 py-0.5 bg-surface-container-high border border-outline-variant rounded">
              Esc
            </kbd>{" "}
            to cancel ·{" "}
            <kbd className="font-mono-code px-1 py-0.5 bg-surface-container-high border border-outline-variant rounded">
              Ctrl+Enter
            </kbd>{" "}
            to start
          </span>
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={onClose}
              className="px-md py-sm border border-outline-variant rounded text-body-sm text-on-surface hover:border-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="bg-primary text-on-primary px-lg py-sm rounded font-bold text-body-sm flex items-center gap-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              <Icon name="play_arrow" filled size={16} />
              Start Run
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default StartRunModal;
