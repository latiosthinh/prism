import React from "react";

interface PipelineSelectorProps {
  pipelines: {
    name: string;
    displayName?: string;
    stepCount: number;
    description: string;
  }[];
  selected: string | null;
  onSelect: (name: string) => void;
}

export const PipelineSelector: React.FC<PipelineSelectorProps> = ({
  pipelines,
  selected,
  onSelect,
}) => {
  if (pipelines.length === 0) {
    return (
      <div className="text-sm text-zinc-500 p-3 bg-zinc-900 border border-zinc-800 rounded">
        No pipelines available — create one from a template.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {pipelines.map((p) => (
        <button
          key={p.name}
          type="button"
          onClick={() => onSelect(p.name)}
          className={`text-left px-3 py-2 rounded border text-sm transition-colors ${
            selected === p.name
              ? "border-zinc-300 bg-zinc-800 text-zinc-50"
              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium truncate">
              {p.displayName ?? p.name}
            </span>
            <span className="text-[10px] text-zinc-500 shrink-0">
              {p.stepCount} steps
            </span>
          </div>
          {p.displayName && p.displayName !== p.name && (
            <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
              {p.name}
            </div>
          )}
          {p.description && (
            <div className="text-xs text-zinc-500 truncate mt-0.5">
              {p.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default PipelineSelector;
