import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StepNode } from "./StepNode.js";
import {
  StepConfigSidebar,
  type StepData,
  type AgentInfo,
  type SkillInfo,
} from "./StepConfigSidebar.js";

export interface LoopGroupData {
  name: string;
  steps: string[];
  maxIterations: number;
  exitOn: "all_pass" | "last_pass";
}

export interface PipelineEditorData {
  name: string;
  version: string;
  description?: string;
  steps: StepData[];
  agents: AgentInfo[];
  skills: SkillInfo[];
  loop_groups: LoopGroupData[];
}

interface PipelineEditorProps {
  /** Basename of the pipeline file (e.g. \`default\` for default.yaml). Used only to detect when to reset editor state from the server snapshot — *not* the display name inside the document. */
  fileKey: string;
  initialData: PipelineEditorData;
  onSave: (data: PipelineEditorData) => void;
  onClose: () => void;
}

interface AgentTemplate {
  key: string;
  label: string;
  agentId: string;
  artifact: string;
  gate: boolean;
  tags: string[];
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  { key: "idea", label: "Idea Expander", agentId: "idea-expander", artifact: "idea.md", gate: true, tags: ["product"] },
  { key: "req", label: "Requirements Engineer", agentId: "requirements-engineer", artifact: "requirements.md", gate: true, tags: ["product"] },
  { key: "arch", label: "Architect", agentId: "architect", artifact: "design.md", gate: true, tags: ["technical"] },
  { key: "tasks", label: "Task Generator", agentId: "task-generator", artifact: "tasks.md", gate: true, tags: ["technical"] },
  { key: "exec", label: "Executor", agentId: "executor", artifact: "tasks.md", gate: false, tags: ["code", "build", "implement"] },
  { key: "critic", label: "Critic", agentId: "critic", artifact: "review.md", gate: false, tags: ["quality"] },
  { key: "tests", label: "Test Writer", agentId: "test-writer", artifact: "tests.md", gate: true, tags: ["quality"] },
  { key: "report", label: "Reporter", agentId: "reporter", artifact: "report.md", gate: false, tags: ["product"] },
];

const EDGE_STYLE = { stroke: "#52525b" } as const;

function layoutNodes(steps: StepData[]): Map<string, { x: number; y: number }> {
  const stepIds = new Set(steps.map((s) => s.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    inDegree.set(s.id, 0);
    adj.set(s.id, []);
  }
  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!stepIds.has(dep)) continue;
      inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1);
      adj.get(dep)?.push(s.id);
    }
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) {
    queue.push(id);
    level.set(id, 0);
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const lvl = level.get(cur) ?? 0;
    for (const next of adj.get(cur) ?? []) {
      const newLvl = lvl + 1;
      if (newLvl > (level.get(next) ?? -1)) level.set(next, newLvl);
      const remain = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remain);
      if (remain === 0) queue.push(next);
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  const buckets = new Map<number, string[]>();
  for (const s of steps) {
    const lvl = level.get(s.id) ?? 0;
    if (!buckets.has(lvl)) buckets.set(lvl, []);
    buckets.get(lvl)!.push(s.id);
  }
  for (const [lvl, ids] of buckets) {
    ids.forEach((id, i) => {
      positions.set(id, { x: lvl * 280, y: i * 130 });
    });
  }
  return positions;
}

function buildNodes(steps: StepData[]): Node[] {
  const layout = layoutNodes(steps);
  return steps.map<Node>((s, i) => {
    const pos = layout.get(s.id) ?? { x: 0, y: i * 130 };
    return {
      id: s.id,
      type: "stepNode",
      position: pos,
      data: {
        id: s.id,
        name: s.name,
        agent: s.agent,
        model: s.model,
        gate: s.gate,
        loop: s.loop,
        tags: s.tags,
      },
    };
  });
}

function buildEdges(steps: StepData[]): Edge[] {
  const ids = new Set(steps.map((s) => s.id));
  const edges: Edge[] = [];
  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!ids.has(dep)) continue;
      edges.push({
        id: `${dep}->${s.id}`,
        source: dep,
        target: s.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: EDGE_STYLE,
      });
    }
  }
  return edges;
}

export const PipelineEditor: React.FC<PipelineEditorProps> = ({
  fileKey,
  initialData,
  onSave,
  onClose,
}) => {
  const [pipelineData, setPipelineData] = useState<PipelineEditorData>(initialData);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    buildNodes(initialData.steps),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    buildEdges(initialData.steps),
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const nodeTypes = useMemo(() => ({ stepNode: StepNode }), []);

  // Only hydrate from the extension snapshot when switching which *file* is open.
  // \`initialData\` is a new object every parent render — if this effect depended on it,
  // Save / list refresh would re-run the effect and wipe in-progress edits & deletes.
  useEffect(() => {
    setPipelineData(initialData);
    setNodes(buildNodes(initialData.steps));
    setEdges(buildEdges(initialData.steps));
    setSelectedStepId(null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only fileKey; initialData identity churns every render
  }, [fileKey, setNodes, setEdges]);

  const updateSteps = useCallback(
    (mutator: (steps: StepData[]) => StepData[]) => {
      setPipelineData((prev) => {
        const next = { ...prev, steps: mutator(prev.steps) };
        return next;
      });
      setDirty(true);
    },
    [],
  );

  const updateDependsOn = useCallback(
    (stepId: string, depId: string, add: boolean) => {
      updateSteps((steps) =>
        steps.map((s) => {
          if (s.id !== stepId) return s;
          const deps = add
            ? Array.from(new Set([...s.depends_on, depId]))
            : s.depends_on.filter((d) => d !== depId);
          return { ...s, depends_on: deps };
        }),
      );
    },
    [updateSteps],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
            style: EDGE_STYLE,
          },
          eds,
        ),
      );
      updateDependsOn(connection.target, connection.source, true);
    },
    [setEdges, updateDependsOn],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        updateDependsOn(e.target, e.source, false);
      }
    },
    [updateDependsOn],
  );

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setSelectedStepId(node.id);
    },
    [],
  );

  const handleStepChange = useCallback(
    (updated: StepData) => {
      const matchId = selectedStepId ?? updated.id;
      updateSteps((steps) =>
        steps.map((s) => (s.id === matchId ? updated : s)),
      );
      setNodes((nds) =>
        nds.map((n) =>
          n.id === matchId
            ? {
                ...n,
                id: updated.id,
                data: {
                  id: updated.id,
                  name: updated.name,
                  agent: updated.agent,
                  model: updated.model,
                  gate: updated.gate,
                  loop: updated.loop,
                  tags: updated.tags,
                },
              }
            : n,
        ),
      );
      if (updated.id !== matchId) {
        setSelectedStepId(updated.id);
        setEdges((eds) =>
          eds.map((e) => {
            const src = e.source === matchId ? updated.id : e.source;
            const tgt = e.target === matchId ? updated.id : e.target;
            return {
              ...e,
              id: `${src}->${tgt}`,
              source: src,
              target: tgt,
            };
          }),
        );
      }
    },
    [setNodes, setEdges, updateSteps, selectedStepId],
  );

  const handleDelete = useCallback(
    (id: string) => {
      updateSteps((steps) =>
        steps
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            depends_on: s.depends_on.filter((d) => d !== id),
          })),
      );
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedStepId(null);
    },
    [setNodes, setEdges, updateSteps],
  );

  const move = useCallback(
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

  const addTemplate = useCallback(
    (template: AgentTemplate) => {
      const baseId = template.agentId;
      const existing = new Set(pipelineData.steps.map((s) => s.id));
      let id = baseId;
      let counter = 2;
      while (existing.has(id)) id = `${baseId}-${counter++}`;

      const newStep: StepData = {
        id,
        name: template.label,
        agent: template.agentId,
        model: "composer-2",
        gate: template.gate,
        maxRetries: 3,
        artifact: template.artifact,
        loop: null,
        tags: template.tags.slice(),
        depends_on: [],
        skills: [],
      };
      updateSteps((steps) => [...steps, newStep]);

      const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0);
      setNodes((nds) =>
        nds.concat([
          {
            id: newStep.id,
            type: "stepNode",
            position: { x: 0, y: maxY + 130 },
            data: {
              id: newStep.id,
              name: newStep.name,
              agent: newStep.agent,
              model: newStep.model,
              gate: newStep.gate,
              loop: newStep.loop,
              tags: newStep.tags,
            },
          },
        ]),
      );
      setSelectedStepId(newStep.id);
    },
    [nodes, pipelineData.steps, setNodes, updateSteps],
  );

  const handleSave = useCallback(() => {
    onSave(pipelineData);
    setDirty(false);
  }, [onSave, pipelineData]);

  const selectedStep =
    pipelineData.steps.find((s) => s.id === selectedStepId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-50px)]">
      <Toolbar
        pipelineName={pipelineData.name}
        dirty={dirty}
        onNameChange={(v) => {
          setPipelineData((p) => ({ ...p, name: v }));
          setDirty(true);
        }}
        onAddTemplate={addTemplate}
        onSave={handleSave}
        onClose={onClose}
      />
      <div className="flex-1 flex">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Controls />
            <Background color="#27272a" gap={16} />
            <MiniMap
              nodeColor={(n) =>
                ((n.data as any)?.tags ?? []).includes("code")
                  ? "#3b82f6"
                  : "#71717a"
              }
              style={{ background: "#18181b" }}
            />
          </ReactFlow>
        </div>
        {selectedStep && (
          <StepConfigSidebar
            step={selectedStep}
            onChange={handleStepChange}
            onClose={() => setSelectedStepId(null)}
            onDelete={handleDelete}
            onMoveUp={(id) => move(id, -1)}
            onMoveDown={(id) => move(id, 1)}
            agents={pipelineData.agents}
            skills={pipelineData.skills}
          />
        )}
      </div>
    </div>
  );
};

interface ToolbarProps {
  pipelineName: string;
  dirty: boolean;
  onNameChange: (v: string) => void;
  onAddTemplate: (t: AgentTemplate) => void;
  onSave: () => void;
  onClose: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  pipelineName,
  dirty,
  onNameChange,
  onAddTemplate,
  onSave,
  onClose,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 relative">
      <button
        type="button"
        onClick={onClose}
        className="px-2.5 py-1 text-xs bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700"
      >
        ← Back
      </button>
      <input
        type="text"
        value={pipelineName}
        onChange={(e) => onNameChange(e.target.value)}
        className="flex-1 max-w-sm px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm"
      />
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1 text-xs bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700"
        >
          + Add Step
        </button>
        {open && (
          <div className="absolute mt-1 right-0 z-20 w-56 bg-zinc-900 border border-zinc-800 rounded shadow-lg">
            {AGENT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  onAddTemplate(t);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1" />
      {dirty && (
        <span className="text-[11px] text-amber-400">Unsaved changes</span>
      )}
      <button
        type="button"
        onClick={onSave}
        className="px-3 py-1 text-xs font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-white"
      >
        Save
      </button>
    </div>
  );
};

export default PipelineEditor;
