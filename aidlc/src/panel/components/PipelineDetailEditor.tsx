import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon.js";
import type {
  StepData,
  AgentInfo,
  SkillInfo,
} from "./dag-canvas/StepConfigSidebar.js";
import type {
  PipelineEditorData,
  LoopGroupData,
} from "./dag-canvas/PipelineEditor.js";

interface PipelineDetailEditorProps {
  pipelineName: string;
  initialData: PipelineEditorData;
  onSave: (data: PipelineEditorData) => void;
  onClose: () => void;
  onRun?: (name: string) => void;
  onClone?: (name: string) => void;
  onDelete?: (name: string) => void;
}

const MODELS = [
  "composer-2",
  "claude-sonnet-4-20250514",
  "claude-3.5-haiku-20241022",
  "gpt-4o-2024-11-20",
  "gemini-2.0-flash-001",
];

const LOOP_MODES = ["None", "Task", "Phase", "Cascade"] as const;

/**
 * Timeline-style detailed step configuration editor matching the
 * `detailed_step_configuration_editor` design. Replaces the DAG canvas
 * editor for everyday step authoring (the canvas is still kept for
 * dependency-graph editing if ever needed in future).
 */
export const PipelineDetailEditor: React.FC<PipelineDetailEditorProps> = ({
  pipelineName,
  initialData,
  onSave,
  onClose,
  onRun,
  onClone,
  onDelete,
}) => {
  const [data, setData] = useState<PipelineEditorData>(initialData);
  const [dirty, setDirty] = useState(false);

  // Only re-hydrate from the extension snapshot when the user opens a *different*
  // pipeline file. `initialData` is a fresh object every parent render, so depending
  // on it would wipe in-progress edits / deletes after every Save or list refresh.
  useEffect(() => {
    setData(initialData);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-hydrate when the pipeline file changes
  }, [pipelineName]);

  const updateSteps = useCallback(
    (mutator: (steps: StepData[]) => StepData[]) => {
      setData((prev) => ({ ...prev, steps: mutator(prev.steps) }));
      setDirty(true);
    },
    [],
  );

  const handleStepChange = useCallback(
    <K extends keyof StepData>(id: string, key: K, value: StepData[K]) => {
      updateSteps((steps) =>
        steps.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
      );
    },
    [updateSteps],
  );

  const handleAddStep = useCallback(() => {
    const baseId = "new-step";
    const existing = new Set(data.steps.map((s) => s.id));
    let id = baseId;
    let counter = 2;
    while (existing.has(id)) id = `${baseId}-${counter++}`;
    const newStep: StepData = {
      id,
      name: "New Step",
      agent: data.agents[0]?.id ?? "executor",
      model: "composer-2",
      gate: true,
      maxRetries: 3,
      artifact: `${id}.md`,
      loop: null,
      tags: [],
      depends_on: [],
      skills: [],
    };
    updateSteps((steps) => [...steps, newStep]);
  }, [data.agents, data.steps, updateSteps]);

  const handleDeleteStep = useCallback(
    (id: string) => {
      // No `window.confirm` — it's unreliable in VS Code webviews (silently returns
      // false), which made the Delete action appear broken. The action-menu click
      // is the user's confirmation; Save is required to persist.
      updateSteps((steps) =>
        steps
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            depends_on: s.depends_on.filter((d) => d !== id),
          })),
      );
    },
    [updateSteps],
  );

  const handleMove = useCallback(
    (id: string, direction: -1 | 1) => {
      updateSteps((steps) => {
        const idx = steps.findIndex((s) => s.id === id);
        if (idx < 0) return steps;
        const next = idx + direction;
        if (next < 0 || next >= steps.length) return steps;
        const copy = steps.slice();
        const [item] = copy.splice(idx, 1);
        copy.splice(next, 0, item);
        return copy;
      });
    },
    [updateSteps],
  );

  const handleSave = useCallback(() => {
    onSave(data);
    setDirty(false);
  }, [data, onSave]);

  const globalMaxRetries = data.steps[0]?.maxRetries ?? 3;
  const setGlobalMaxRetries = (n: number): void => {
    updateSteps((steps) => steps.map((s) => ({ ...s, maxRetries: n })));
  };
  const [stopOnError, setStopOnError] = useState(true);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [concurrency, setConcurrency] = useState("1 (Sequential)");

  return (
    <div className="flex h-[calc(100vh-50px)]">
      {/* Center: header + step timeline */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant sticky top-0 bg-background z-30 flex-wrap gap-sm">
          <div className="flex flex-col">
            <div className="flex items-center gap-xs text-on-surface-variant mb-1">
              <button
                type="button"
                onClick={onClose}
                className="text-body-sm hover:text-primary transition-colors"
              >
                Project
              </button>
              <Icon name="chevron_right" size={14} />
              <button
                type="button"
                onClick={onClose}
                className="text-body-sm hover:text-primary transition-colors"
              >
                Pipelines
              </button>
              <Icon name="chevron_right" size={14} />
              <span className="text-body-sm text-on-surface">
                {data.name || pipelineName}
              </span>
            </div>
            <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {data.name || pipelineName}
            </h1>
          </div>
          <div className="flex items-center gap-sm flex-wrap">
            {dirty && (
              <span className="text-[11px] text-tertiary font-mono-code">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={() => onClone?.(data.name)}
              disabled={!onClone}
              className="flex items-center gap-xs px-md py-xs border border-outline-variant rounded text-body-sm text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="content_copy" size={16} />
              Clone Pipeline
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete pipeline "${data.name}"?`))
                  onDelete?.(data.name);
              }}
              disabled={!onDelete}
              className="flex items-center gap-xs px-md py-xs border border-error text-error rounded text-body-sm hover:bg-error/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="delete" size={16} />
              Delete
            </button>
            <div className="w-px h-6 bg-outline-variant mx-xs" />
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-xs px-md py-xs bg-surface-container-high border border-outline-variant text-on-surface rounded text-body-sm font-bold hover:border-primary transition-colors"
            >
              <Icon name="save" size={16} />
              Save
            </button>
            {onRun && (
              <button
                type="button"
                onClick={() => {
                  if (dirty) handleSave();
                  // IMPORTANT: pass the file basename (pipelineName prop), NOT
                  // data.name. data.name is the editable in-yaml display string
                  // (e.g. "Simple Executor"); the loader resolves files by their
                  // basename (e.g. "simple-executor.yaml").
                  onRun(pipelineName);
                }}
                className="flex items-center gap-xs px-md py-xs bg-primary text-on-primary rounded text-body-sm font-bold hover:opacity-90 transition-opacity"
                title="Save and open the run screen for this pipeline"
              >
                <Icon name="play_arrow" filled size={16} />
                Run Pipeline
              </button>
            )}
          </div>
        </div>

        {/* Pipeline name editor */}
        <div className="px-lg pt-md max-w-5xl mx-auto w-full">
          <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
            Pipeline Name
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => {
              setData((prev) => ({ ...prev, name: e.target.value }));
              setDirty(true);
            }}
            className="w-full bg-surface-container-high border border-outline-variant text-on-surface text-body-md font-bold rounded p-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>

        {/* Step timeline */}
        <div className="flex-1 p-lg overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-md relative">
            {data.steps.length > 0 && (
              <div className="absolute left-[19px] top-4 bottom-16 w-px bg-outline-variant -z-10" />
            )}

            {data.steps.map((step, idx) => (
              <StepTimelineCard
                key={step.id}
                index={idx + 1}
                step={step}
                agents={data.agents}
                skills={data.skills}
                onChange={(key, value) => handleStepChange(step.id, key, value)}
                onMoveUp={() => handleMove(step.id, -1)}
                onMoveDown={() => handleMove(step.id, 1)}
                onDelete={() => handleDeleteStep(step.id)}
                isFirst={idx === 0}
                isLast={idx === data.steps.length - 1}
              />
            ))}

            <button
              type="button"
              onClick={handleAddStep}
              className="ml-14 flex items-center gap-sm px-md py-sm border-2 border-dashed border-outline-variant text-on-surface-variant rounded w-[calc(100%-3.5rem)] justify-center hover:border-primary hover:text-primary transition-all"
            >
              <Icon name="add_circle" size={20} />
              <span className="font-bold">Add Step</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Global Settings */}
      <aside className="w-80 shrink-0 bg-surface-container-low border-l border-outline-variant p-lg flex flex-col gap-lg overflow-y-auto">
        <section>
          <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-md">
            Global Settings
          </h2>
          <div className="space-y-md">
            <div className="flex flex-col gap-xs">
              <label className="text-body-sm font-bold text-on-surface">
                Max Retries
              </label>
              <div className="flex items-center gap-sm">
                <input
                  type="range"
                  min={0}
                  max={5}
                  value={globalMaxRetries}
                  onChange={(e) => setGlobalMaxRetries(Number(e.target.value))}
                  className="flex-1 accent-primary bg-surface-container-high h-1 rounded-full"
                />
                <span className="font-mono-code text-body-sm text-primary w-4 text-right">
                  {globalMaxRetries}
                </span>
              </div>
            </div>

            <ToggleRow
              label="Stop on Error"
              hint="Halt if any step fails"
              checked={stopOnError}
              onChange={setStopOnError}
            />

            <ToggleRow
              label="Auto-Deploy"
              hint="Deploy to staging on success"
              checked={autoDeploy}
              onChange={setAutoDeploy}
            />

            <div className="flex flex-col gap-xs">
              <label className="text-body-sm font-bold text-on-surface">
                Concurrency Limit
              </label>
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                className="bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none"
              >
                <option>1 (Sequential)</option>
                <option>2 Parallel</option>
                <option>4 Parallel</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-md">
            Environment
          </h2>
          <div className="bg-surface-container border border-outline-variant rounded p-sm font-mono-code text-[11px] text-on-surface-variant space-y-1">
            <div className="flex justify-between">
              <span>NODE_ENV</span>
              <span className="text-secondary">production</span>
            </div>
            <div className="flex justify-between">
              <span>TIMEOUT</span>
              <span className="text-secondary">30000ms</span>
            </div>
            <div className="flex justify-between">
              <span>REGION</span>
              <span className="text-secondary">us-east-1</span>
            </div>
          </div>
        </section>

        <section className="mt-auto pt-lg">
          <div className="bg-surface-container-high p-md rounded flex items-start gap-sm">
            <div className="p-xs bg-secondary/15 rounded shrink-0">
              <Icon name="info" className="text-secondary" size={18} />
            </div>
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Changes made here will affect all future runs of the{" "}
              <strong className="text-on-surface">
                {data.name || pipelineName}
              </strong>{" "}
              pipeline. Previous logs will be preserved.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
};

interface StepTimelineCardProps {
  index: number;
  step: StepData;
  agents: AgentInfo[];
  skills: SkillInfo[];
  onChange: <K extends keyof StepData>(key: K, value: StepData[K]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const StepTimelineCard: React.FC<StepTimelineCardProps> = ({
  index,
  step,
  agents,
  skills,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
}) => {
  const [tagDraft, setTagDraft] = useState("");
  const [showActions, setShowActions] = useState(false);

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) =>
        (a.label || a.id).localeCompare(b.label || b.id),
      ),
    [agents],
  );
  const sortedSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        (a.label || a.id).localeCompare(b.label || b.id),
      ),
    [skills],
  );

  const addTag = (): void => {
    const v = tagDraft.trim();
    if (!v || step.tags.includes(v)) return;
    onChange("tags", [...step.tags, v]);
    setTagDraft("");
  };

  const removeTag = (t: string): void => {
    onChange(
      "tags",
      step.tags.filter((x) => x !== t),
    );
  };

  const toggleSkill = (id: string): void => {
    onChange(
      "skills",
      step.skills.includes(id)
        ? step.skills.filter((s) => s !== id)
        : [...step.skills, id],
    );
  };

  const loopMode = step.loop?.mode
    ? step.loop.mode[0].toUpperCase() + step.loop.mode.slice(1)
    : "None";

  return (
    <div className="flex gap-md group">
      {/* Number badge */}
      <div className="w-10 flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary font-bold text-body-sm">
          {index}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 bg-surface-container border border-outline-variant rounded p-md group-hover:border-primary transition-colors">
        <div className="flex justify-between items-start mb-sm">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={step.name}
              onChange={(e) => onChange("name", e.target.value)}
              className="font-bold text-on-surface bg-transparent border-none p-0 w-full focus:outline-none focus:ring-0"
            />
            <div className="flex items-center gap-xs mt-1 text-[10px] text-on-surface-variant font-mono-code">
              <span>STEP ID:</span>
              <input
                type="text"
                value={step.id}
                onChange={(e) => onChange("id", e.target.value)}
                className="bg-transparent border-none p-0 text-[10px] focus:ring-0 focus:outline-none w-32 text-primary"
              />
            </div>
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowActions((v) => !v)}
              className="text-on-surface-variant hover:text-primary p-xs"
              aria-label="Step actions"
            >
              <Icon name="drag_indicator" size={18} />
            </button>
            {showActions && (
              <div
                className="absolute right-0 top-full mt-1 z-10 w-44 bg-surface-container-high border border-outline-variant rounded shadow-2xl py-1"
                onMouseLeave={() => setShowActions(false)}
              >
                <ActionItem
                  icon="arrow_upward"
                  label="Move up"
                  disabled={isFirst}
                  onClick={() => {
                    onMoveUp();
                    setShowActions(false);
                  }}
                />
                <ActionItem
                  icon="arrow_downward"
                  label="Move down"
                  disabled={isLast}
                  onClick={() => {
                    onMoveDown();
                    setShowActions(false);
                  }}
                />
                <div className="my-1 border-t border-outline-variant" />
                <ActionItem
                  icon="delete"
                  label="Delete step"
                  destructive
                  onClick={() => {
                    onDelete();
                    setShowActions(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Configuration: Agent / Model / Loop on one row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-md">
          <div className="flex flex-col gap-xs min-w-0">
            <FieldLabel>Agent</FieldLabel>
            <select
              value={step.agent}
              onChange={(e) => onChange("agent", e.target.value)}
              className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none"
            >
              {sortedAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
              {!agents.find((a) => a.id === step.agent) && step.agent && (
                <option value={step.agent}>{step.agent} (custom)</option>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-xs min-w-0">
            <FieldLabel>Model</FieldLabel>
            <select
              value={step.model}
              onChange={(e) => onChange("model", e.target.value)}
              className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {!MODELS.includes(step.model) && step.model && (
                <option value={step.model}>{step.model} (custom)</option>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-xs min-w-0">
            <FieldLabel>Loop Mode</FieldLabel>
            <select
              value={loopMode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "None") {
                  onChange("loop", null);
                } else {
                  onChange("loop", {
                    mode: v.toLowerCase(),
                    agent: step.loop?.agent ?? "critic",
                    maxIterations: step.loop?.maxIterations ?? 3,
                    target: step.loop?.target,
                  });
                }
              }}
              className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none"
            >
              {LOOP_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Configuration: Artifact (wide) + Max Retries */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-md">
          <div className="flex flex-col gap-xs min-w-0 md:col-span-2">
            <FieldLabel>Output Artifact</FieldLabel>
            <input
              type="text"
              value={step.artifact}
              onChange={(e) => onChange("artifact", e.target.value)}
              className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none font-mono-code"
            />
          </div>
          <div className="flex flex-col gap-xs min-w-0">
            <FieldLabel>Max Retries</FieldLabel>
            <input
              type="number"
              min={0}
              max={10}
              value={step.maxRetries}
              onChange={(e) => onChange("maxRetries", Number(e.target.value))}
              className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none text-center"
            />
          </div>
        </div>

        {/* Human Gate toggle on its own row */}
        <div className="flex items-center justify-between gap-sm mb-md p-sm bg-surface-container-low border border-outline-variant rounded">
          <div className="flex flex-col">
            <span className="text-body-sm font-bold text-on-surface">
              Human Gate
            </span>
            <span className="text-[10px] text-on-surface-variant">
              Pause for manual approval before proceeding
            </span>
          </div>
          <Toggle
            checked={step.gate}
            onChange={(v) => onChange("gate", v)}
          />
        </div>

        {/* Metadata: tags + skills */}
        <div className="border-t border-outline-variant pt-md grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="min-w-0">
            <FieldLabel className="mb-xs block">Tags</FieldLabel>
            <div className="flex flex-wrap gap-xs items-center">
              {step.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 bg-surface-container-high text-primary rounded text-[10px] flex items-center gap-1 font-mono-code"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-on-surface-variant hover:text-error"
                    aria-label={`Remove tag ${t}`}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
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
                placeholder="+ Add"
                className="px-2 py-0.5 border border-dashed border-outline-variant bg-transparent text-on-surface-variant rounded text-[10px] w-20 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="min-w-0">
            <FieldLabel className="mb-xs block">Required Skills</FieldLabel>
            {skills.length === 0 ? (
              <div className="text-[10px] text-outline italic">
                No skills available
              </div>
            ) : (
              <div className="flex flex-col gap-xs">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleSkill(e.target.value);
                  }}
                  className="w-full min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-xs focus:border-primary focus:ring-0 outline-none"
                >
                  <option value="">+ Add skill...</option>
                  {sortedSkills
                    .filter((s) => !step.skills.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </select>
                {step.skills.length > 0 && (
                  <div className="flex flex-wrap gap-xs">
                    {step.skills.map((id) => {
                      const s = skills.find((x) => x.id === id);
                      const label = s?.label ?? id;
                      return (
                        <span
                          key={id}
                          className="px-2 py-0.5 bg-secondary/20 text-secondary border border-secondary/40 rounded text-[10px] flex items-center gap-1"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={() => toggleSkill(id)}
                            className="hover:text-error"
                            aria-label={`Remove skill ${label}`}
                          >
                            <Icon name="close" size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ActionItemProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

const ActionItem: React.FC<ActionItemProps> = ({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left flex items-center gap-sm px-sm py-1.5 text-body-sm transition-colors ${
      destructive
        ? "text-error hover:bg-error/10"
        : "text-on-surface hover:bg-surface-container-highest"
    } disabled:opacity-40 disabled:cursor-not-allowed`}
  >
    <Icon name={icon} size={16} />
    {label}
  </button>
);

const FieldLabel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <label
    className={`text-[10px] font-bold uppercase tracking-wider text-on-surface-variant ${className}`}
  >
    {children}
  </label>
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    aria-pressed={checked}
    className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
      checked ? "bg-secondary" : "bg-surface-container-highest"
    }`}
  >
    <span
      className={`block w-4 h-4 bg-white rounded-full transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  hint,
  checked,
  onChange,
}) => (
  <div className="flex items-center justify-between gap-sm">
    <div className="flex flex-col min-w-0">
      <span className="text-body-sm font-bold text-on-surface">{label}</span>
      <span className="text-[10px] text-on-surface-variant">{hint}</span>
    </div>
    <Toggle checked={checked} onChange={onChange} />
  </div>
);

export type { PipelineEditorData, LoopGroupData, StepData };

export default PipelineDetailEditor;
