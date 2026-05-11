import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.js";
import type { AgentEvent } from "../hooks/useExtensionState.js";

interface AgentStreamProps {
  events: AgentEvent[];
}

interface EventVisual {
  glyph: string;
  glyphClass: string;
  containerClass: string;
}

const VISUALS: Record<string, EventVisual> = {
  thinking: {
    glyph: "#",
    glyphClass: "text-secondary",
    containerClass: "text-on-surface italic opacity-80",
  },
  text: {
    glyph: "i",
    glyphClass: "text-primary-container",
    containerClass: "text-on-surface",
  },
  tool_use: {
    glyph: ">_",
    glyphClass: "text-primary-container",
    containerClass: "text-on-surface",
  },
  tool_result: {
    glyph: "<",
    glyphClass: "text-secondary",
    containerClass: "text-on-surface",
  },
  progress: {
    glyph: "\u00b7",
    glyphClass: "text-tertiary",
    containerClass: "text-tertiary",
  },
  error: {
    glyph: "!",
    glyphClass: "text-error",
    containerClass: "text-error",
  },
  done: {
    glyph: "\u2713",
    glyphClass: "text-secondary",
    containerClass: "text-secondary",
  },
  review: {
    glyph: "?",
    glyphClass: "text-tertiary",
    containerClass: "text-tertiary",
  },
  task_update: {
    glyph: "*",
    glyphClass: "text-primary",
    containerClass: "text-on-surface",
  },
  file_change: {
    glyph: "~",
    glyphClass: "text-primary",
    containerClass: "text-on-surface",
  },
};

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
};

const truncate = (s: string, max = 600): string =>
  s.length > max ? s.slice(0, max) + "\u2026" : s;

export const AgentStream: React.FC<AgentStreamProps> = ({ events }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showThinking, setShowThinking] = useState(false);

  const visible = events.filter(
    (e) => showThinking || e.type !== "thinking",
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
      {/* Terminal chrome */}
      <div className="bg-surface-container-low border-b border-outline-variant px-md py-xs flex justify-between items-center">
        <div className="flex items-center gap-sm">
          <Icon name="terminal" size={14} className="text-on-surface-variant" />
          <span className="font-label-caps text-[10px] tracking-wider uppercase text-on-surface-variant">
            Agent Stream
          </span>
        </div>
        <div className="flex items-center gap-md">
          <label className="flex items-center gap-1.5 text-[10px] text-on-surface-variant cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
              className="accent-primary"
            />
            Show thinking
          </label>
          <div className="flex gap-xs">
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
            <span className="w-2 h-2 rounded-full bg-outline-variant" />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="p-md font-mono-code text-mono-code space-y-sm h-[260px] overflow-y-auto bg-black/60"
      >
        {visible.length === 0 ? (
          <div className="text-outline italic text-center py-md">
            No events yet - start a pipeline run to see live output
          </div>
        ) : (
          visible.map((event, idx) => {
            const visual = VISUALS[event.type] ?? {
              glyph: "\u00b7",
              glyphClass: "text-on-surface-variant",
              containerClass: "text-on-surface",
            };
            const display =
              event.type === "tool_result"
                ? truncate(event.content, 600)
                : event.content;
            const showAsBlock =
              event.type === "tool_use" || event.type === "tool_result";
            return (
              <div key={idx} className="flex gap-md">
                <span className={`shrink-0 w-4 ${visual.glyphClass}`}>
                  {visual.glyph}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-md text-[10px] text-outline">
                    <span>{formatTime(event.timestamp)}</span>
                    <span className="truncate max-w-[160px]">
                      [{event.stepId}]
                    </span>
                    <span className="uppercase tracking-wider">
                      {event.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  {showAsBlock ? (
                    <pre className="mt-1 bg-surface-container-low border border-outline-variant rounded p-sm text-[11px] text-on-surface-variant whitespace-pre-wrap break-words">
                      {display}
                    </pre>
                  ) : (
                    <p
                      className={`whitespace-pre-wrap break-words ${visual.containerClass}`}
                    >
                      {display}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        {/* Blinking cursor on last line */}
        <div className="flex gap-md animate-pulse">
          <span className="text-primary shrink-0 w-4">&gt;</span>
          <span className="w-2 h-4 bg-primary inline-block" />
        </div>
      </div>
    </section>
  );
};

export default AgentStream;
