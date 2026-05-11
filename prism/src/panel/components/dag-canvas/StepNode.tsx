import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface StepNodeData {
  id: string;
  name: string;
  agent: string;
  model: string;
  gate: boolean;
  loop?: { mode?: string } | null;
  tags?: string[];
  [key: string]: unknown;
}

const loopBadge = (mode?: string): string => {
  if (!mode || mode === "none") return "";
  return `🔄 ${mode}`;
};

export const StepNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as StepNodeData;
  const tags = d.tags ?? [];
  return (
    <div
      className={`bg-zinc-900 border rounded-lg p-3 w-52 shadow ${
        selected ? "border-blue-500" : "border-zinc-700"
      }`}
    >
      <Handle
        type="target"
        id="target"
        position={Position.Left}
        style={{ background: "#52525b", width: 8, height: 8 }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-50 truncate flex-1">
          {d.name || d.id}
        </div>
        {d.gate && (
          <span title="Gate (requires approval)" className="text-xs">
            🔒
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-zinc-400 truncate">{d.agent}</div>
      <div className="text-[10px] text-zinc-500 truncate">{d.model}</div>
      <div className="mt-2 flex flex-wrap gap-1 items-center">
        {d.loop?.mode && (
          <span className="text-[9px] px-1.5 py-0.5 bg-purple-900/40 text-purple-200 rounded">
            {loopBadge(d.loop.mode)}
          </span>
        )}
        {tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded"
          >
            {t}
          </span>
        ))}
        {tags.length > 3 && (
          <span className="text-[9px] text-zinc-500">+{tags.length - 3}</span>
        )}
      </div>
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        style={{ background: "#52525b", width: 8, height: 8 }}
      />
    </div>
  );
};

export const nodeTypes = { stepNode: StepNode };

export default StepNode;
