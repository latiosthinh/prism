import React, { useState } from "react";

export interface StepData {
  id: string;
  name: string;
  agent: string;
  model: string;
  gate: boolean;
  maxRetries: number;
  artifact: string;
  loop:
    | {
        mode: string;
        agent?: string;
        maxIterations: number;
        target?: string;
      }
    | null;
  tags: string[];
  depends_on: string[];
  skills: string[];
}

export interface AgentInfo {
  id: string;
  label: string;
}

export interface SkillInfo {
  id: string;
  label: string;
}

interface SidebarProps {
  step: StepData | null;
  onChange: (step: StepData) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  agents: AgentInfo[];
  skills: SkillInfo[];
}

const MODELS = [
  "composer-2",
  "claude-sonnet-4-20250514",
  "claude-3.5-haiku-20241022",
  "gpt-4o-2024-11-20",
  "gemini-2.0-flash-001",
];

export const StepConfigSidebar: React.FC<SidebarProps> = ({
  step,
  onChange,
  onClose,
  onDelete,
  onMoveUp,
  onMoveDown,
  agents,
  skills,
}) => {
  const [tagDraft, setTagDraft] = useState("");

  if (!step) return null;

  const update = <K extends keyof StepData>(key: K, value: StepData[K]): void => {
    onChange({ ...step, [key]: value });
  };

  const addTag = (): void => {
    const v = tagDraft.trim();
    if (!v) return;
    if (!step.tags.includes(v)) {
      update("tags", [...step.tags, v]);
    }
    setTagDraft("");
  };

  const removeTag = (t: string): void => {
    update("tags", step.tags.filter((x) => x !== t));
  };

  const toggleSkill = (id: string): void => {
    update(
      "skills",
      step.skills.includes(id)
        ? step.skills.filter((s) => s !== id)
        : [...step.skills, id],
    );
  };

  const updateLoop = <K extends keyof NonNullable<StepData["loop"]>>(
    key: K,
    value: NonNullable<StepData["loop"]>[K],
  ): void => {
    const current = step.loop ?? {
      mode: "task",
      agent: "critic",
      maxIterations: 3,
    };
    update("loop", { ...current, [key]: value });
  };

  const idValid = /^[a-z0-9-]+$/.test(step.id);

  return (
    <aside className="w-80 shrink-0 h-full overflow-y-auto bg-zinc-900 border-l border-zinc-800">
      <div className="sticky top-0 bg-zinc-900 z-10 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-50 truncate">
          {step.name || step.id}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <div className="p-4 space-y-4 text-sm text-zinc-200">
        <div>
          <Label>Step ID</Label>
          <input
            type="text"
            value={step.id}
            onChange={(e) => update("id", e.target.value)}
            className={`w-full px-2 py-1.5 bg-zinc-950 border rounded text-zinc-50 text-sm ${idValid ? "border-zinc-800" : "border-red-700"}`}
          />
          {!idValid && (
            <div className="text-[11px] text-red-400 mt-1">
              Use lowercase letters, digits, or '-' only
            </div>
          )}
        </div>

        <div>
          <Label>Name</Label>
          <input
            type="text"
            value={step.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
          />
        </div>

        <div>
          <Label>Agent</Label>
          <select
            value={step.agent}
            onChange={(e) => update("agent", e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.id})
              </option>
            ))}
            {!agents.find((a) => a.id === step.agent) && step.agent && (
              <option value={step.agent}>{step.agent} (custom)</option>
            )}
          </select>
        </div>

        <div>
          <Label>Model</Label>
          <input
            list="aidlc-model-options"
            type="text"
            value={step.model}
            onChange={(e) => update("model", e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
          />
          <datalist id="aidlc-model-options">
            {MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center justify-between">
          <Label className="mb-0">Gate (requires approval)</Label>
          <Toggle checked={step.gate} onChange={(v) => update("gate", v)} />
        </div>

        <div>
          <Label>Max Retries</Label>
          <input
            type="number"
            min={0}
            max={10}
            value={step.maxRetries}
            onChange={(e) => update("maxRetries", Number(e.target.value))}
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
          />
        </div>

        <div>
          <Label>Artifact File</Label>
          <input
            type="text"
            value={step.artifact}
            onChange={(e) => update("artifact", e.target.value)}
            placeholder="e.g., design.md"
            className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
          />
        </div>

        <div>
          <Label>Skills</Label>
          {skills.length === 0 ? (
            <div className="text-[11px] text-zinc-500">No skills defined.</div>
          ) : (
            <div className="space-y-1">
              {skills.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-[12px] text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={step.skills.includes(s.id)}
                    onChange={() => toggleSkill(s.id)}
                    className="accent-zinc-300"
                  />
                  <span className="truncate">{s.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1 mb-2">
            {step.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add tag and press Enter"
              className="flex-1 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-2 py-1.5 text-xs bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700"
            >
              Add
            </button>
          </div>
        </div>

        <details open={!!step.loop} className="bg-zinc-950 border border-zinc-800 rounded">
          <summary className="px-3 py-2 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer">
            Loop Config
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <div>
              <Label>Mode</Label>
              <select
                value={step.loop?.mode ?? "none"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "none") update("loop", null);
                  else
                    update("loop", {
                      mode: v,
                      agent: step.loop?.agent ?? "critic",
                      maxIterations: step.loop?.maxIterations ?? 3,
                      target: step.loop?.target,
                    });
                }}
                className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-50 text-sm"
              >
                <option value="none">None</option>
                <option value="task">Task</option>
                <option value="phase">Phase</option>
                <option value="cascade">Cascade</option>
              </select>
            </div>
            {step.loop && (
              <>
                <div>
                  <Label>Critic Agent</Label>
                  <input
                    type="text"
                    value={step.loop.agent ?? ""}
                    onChange={(e) => updateLoop("agent", e.target.value)}
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-50 text-sm"
                  />
                </div>
                <div>
                  <Label>Max Iterations</Label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={step.loop.maxIterations}
                    onChange={(e) =>
                      updateLoop("maxIterations", Number(e.target.value))
                    }
                    className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-50 text-sm"
                  />
                </div>
                {step.loop.mode === "cascade" && (
                  <div>
                    <Label>Cascade Target Step ID</Label>
                    <input
                      type="text"
                      value={step.loop.target ?? ""}
                      onChange={(e) => updateLoop("target", e.target.value)}
                      className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-50 text-sm"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </details>

        <div>
          <Label>Dependencies</Label>
          {step.depends_on.length === 0 ? (
            <div className="text-[11px] text-zinc-500">
              None — drag edges in the canvas to add dependencies
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {step.depends_on.map((d) => (
                <span
                  key={d}
                  className="text-[11px] px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => onMoveUp(step.id)}
            className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700"
          >
            ↑ Move up
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(step.id)}
            className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700"
          >
            ↓ Move down
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(step.id);
          }}
          className="w-full px-2 py-1.5 text-xs font-medium bg-red-900/40 border border-red-800 text-red-200 rounded hover:bg-red-900/60"
        >
          Delete Step
        </button>
      </div>
    </aside>
  );
};

const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`text-[10px] uppercase tracking-wider text-zinc-500 mb-1 ${className}`}
  >
    {children}
  </div>
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
    className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
      checked ? "bg-emerald-600" : "bg-zinc-700"
    }`}
  >
    <span
      className={`block w-4 h-4 bg-white rounded-full transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

export default StepConfigSidebar;
