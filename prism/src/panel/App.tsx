import React, { useEffect, useState } from "react";
import { useExtensionState } from "./hooks/useExtensionState.js";
import { Sidebar, type SidebarTab } from "./components/Sidebar.js";
import { TopBar } from "./components/TopBar.js";
import { Icon } from "./components/Icon.js";
import { PipelineListPage } from "./components/PipelineListPage.js";
import { Pipeline } from "./components/Pipeline.js";
import { RunsList } from "./components/RunsList.js";
import { SkillModal, type SkillEntry } from "./components/SkillModal.js";
import { PipelineDetailEditor } from "./components/PipelineDetailEditor.js";
import { SettingsPage, type PRISMSettings } from "./components/SettingsPage.js";
import {
  StartRunModal,
  type StartRunPayload,
} from "./components/StartRunModal.js";
import type { PipelineEditorData } from "./components/dag-canvas/PipelineEditor.js";
import type {
  StepData,
  AgentInfo,
  SkillInfo,
} from "./components/dag-canvas/StepConfigSidebar.js";

/** Top-level view (sidebar tab) plus a transient `run` view (no sidebar entry). */
type View = SidebarTab | "run";

const App: React.FC = () => {
  const [view, setView] = useState<View>("pipelines");
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillEntry | null>(null);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [startRunOpen, setStartRunOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    state,
    events,
    decisions,
    pipelines,
    agents,
    skills,
    connected,
    error,
    send,
    pipelineData,
    settings,
    verifyResult,
    verifyInFlight,
  } = useExtensionState();

  const handleSelect = (name: string): void => {
    setSelectedPipeline(name);
    setView("run");
    send({ type: "editPipeline", name });
  };

  const handleEdit = (name: string): void => {
    setSelectedPipeline(name);
    setView("editor");
    send({ type: "editPipeline", name });
  };

  const handleCreateFromTemplate = (template: string): void => {
    send({ type: "createFromTemplate", template });
  };

  const handleCreateNew = (): void => {
    send({ type: "createPipeline" });
  };

  const handleBack = (): void => {
    setView("pipelines");
  };

  const handleNavigate = (tab: SidebarTab): void => {
    setView(tab);
    if (tab === "runs") send({ type: "listRuns" });
    if (tab === "settings") send({ type: "getSettings" });
  };

  const handleOpenStartRun = (): void => {
    // Refresh the pipeline list so the picker is current.
    send({ type: "listPipelines" });
    setStartRunOpen(true);
  };

  const handleStartRunSubmit = (payload: StartRunPayload): void => {
    setStartRunOpen(false);
    // Navigate to live run view first so the user immediately sees progress.
    setSelectedPipeline(payload.pipelineName);
    setView("run");
    send({ type: "editPipeline", name: payload.pipelineName });
    send({
      type: "startRun",
      pipeline: payload.pipelineName,
      idea: payload.idea,
      title: payload.title,
      description: payload.description,
    });
  };

  // React to incoming pipelineData snapshots:
  //   - In "run" view: Run flow just loaded the pipeline — stay put.
  //   - In "editor" view: a save-rename happened — sync `selectedPipeline` to
  //     the canonical (possibly slug-renamed) basename so subsequent saves
  //     target the right file.
  //   - Anywhere else (pipelines, runs, skills): a Create flow just finished
  //     — jump into the editor.
  useEffect(() => {
    const incoming = pipelineData?.name;
    if (!incoming) return;
    if (view === "run") return;
    if (view === "editor") {
      if (selectedPipeline !== incoming) setSelectedPipeline(incoming);
      return;
    }
    setSelectedPipeline(incoming);
    setView("editor");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- view/selectedPipeline read but should not retrigger this effect
  }, [pipelineData?.name]);

  // Belt-and-suspenders refetch on landing on Pipelines so list stays in sync.
  useEffect(() => {
    if (view === "pipelines") {
      send({ type: "listPipelines" });
    }
  }, [view, send]);

  // Sidebar shows the parent tab when in the transient `run` view.
  const sidebarActive: SidebarTab =
    view === "run" ? "pipelines" : (view as SidebarTab);

  const filteredPipelines = searchQuery
    ? pipelines.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.displayName?.toLowerCase().includes(q) ?? false)
        );
      })
    : pipelines;

  const topBar = (() => {
    switch (view) {
      case "pipelines":
        return (
          <TopBar
            title="AI Pipeline Manager"
            connected={connected}
            searchPlaceholder="Search pipelines..."
            searchValue={searchQuery}
            onSearch={setSearchQuery}
          />
        );
      case "run":
        return (
          <TopBar
            title={selectedPipeline ?? "Pipeline"}
            subtitle={
              state?.runStatus ? `\u00b7 ${state.runStatus}` : undefined
            }
            onBack={handleBack}
            connected={connected}
          />
        );
      case "runs":
        return <TopBar title="Run History" connected={connected} />;
      case "skills":
        return <TopBar title="Skills Library" connected={connected} />;
      case "editor":
        return (
          <TopBar
            title={selectedPipeline ?? "Editor"}
            subtitle="Editor"
            onBack={handleBack}
            connected={connected}
          />
        );
    }
  })();

  return (
    <div className="min-h-screen bg-background text-on-surface flex">
      <Sidebar
        active={sidebarActive}
        hasSelectedPipeline={!!selectedPipeline}
        onNavigate={handleNavigate}
        onCreatePipeline={handleCreateNew}
        onStartRun={handleOpenStartRun}
      />

      <main className="flex-1 ml-64 min-w-0 flex flex-col bg-surface-container-lowest">
        {topBar}

        {error && (
          <div className="px-lg py-sm bg-error/15 border-b border-error/30 text-body-sm text-error flex items-center gap-sm">
            <Icon name="error" size={16} />
            {error}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {view === "pipelines" && (
            <PipelineListPage
              pipelines={filteredPipelines}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onCreateFromTemplate={handleCreateFromTemplate}
              onCreateNew={handleCreateNew}
              onRefresh={() => send({ type: "listPipelines" })}
            />
          )}

          {view === "run" && selectedPipeline && (
            <Pipeline
              pipelineName={selectedPipeline}
              state={state}
              events={events}
              decisions={decisions}
              send={send}
            />
          )}

          {view === "runs" && (
            <RunsList
              onRerun={(r) => {
                setSelectedPipeline(r.pipelineName);
                setView("run");
                send({ type: "editPipeline", name: r.pipelineName });
              }}
              onOpenLive={(pipelineName) => {
                setSelectedPipeline(pipelineName);
                setView("run");
                send({ type: "editPipeline", name: pipelineName });
              }}
              onStartRun={handleOpenStartRun}
            />
          )}

          {view === "skills" && (
            <SkillsTab
              skills={skills}
              onEdit={(s) => {
                setEditingSkill(s);
                setSkillModalOpen(true);
              }}
              onCreate={() => {
                setEditingSkill(null);
                setSkillModalOpen(true);
              }}
            />
          )}

          {view === "settings" && (
            <SettingsPage
              settings={settings}
              verifyResult={verifyResult}
              verifyInFlight={verifyInFlight}
              onSave={(next: Partial<PRISMSettings>) =>
                send({ type: "saveSettings", settings: next })
              }
              onVerify={() => send({ type: "verifyCursorSdk" })}
              onRequestRefresh={() => send({ type: "getSettings" })}
            />
          )}

          {view === "editor" && selectedPipeline && (
            <EditorView
              pipelineName={selectedPipeline}
              pipelineData={pipelineData}
              agents={agents}
              skills={skills}
              onSave={(data: PipelineEditorData) => {
                // ALWAYS save back to the same file (selectedPipeline = file basename).
                // Previously this used `data.name` (the in-yaml display name), which
                // for built-in templates differs from the file basename — so every
                // save silently renamed the file, churned `selectedPipeline`, and
                // re-keyed the editor's hydrate effect → deleted steps reappeared
                // and a follow-up save persisted the stale state. Renames are now
                // an explicit user action via the dedicated rename flow.
                send({
                  type: "savePipeline",
                  name: selectedPipeline,
                  pipeline: serializePipelineForSave(data),
                });
              }}
              onClose={handleBack}
              onRun={(name) => handleSelect(name)}
            />
          )}
        </div>
      </main>

      {skillModalOpen && (
        <SkillModal
          skill={editingSkill}
          onClose={() => setSkillModalOpen(false)}
          onSave={(id, content) => {
            send({ type: "saveSkill", id, content });
            setSkillModalOpen(false);
          }}
        />
      )}

      <StartRunModal
        open={startRunOpen}
        pipelines={pipelines}
        initialPipeline={selectedPipeline}
        onClose={() => setStartRunOpen(false)}
        onSubmit={handleStartRunSubmit}
      />
    </div>
  );
};

interface SkillsTabProps {
  skills: any[];
  onEdit: (s: SkillEntry) => void;
  onCreate: () => void;
}

const SkillsTab: React.FC<SkillsTabProps> = ({ skills, onEdit, onCreate }) => (
  <div className="p-lg max-w-7xl mx-auto space-y-md">
    <div className="flex items-center justify-between gap-md flex-wrap">
      <div>
        <p className="text-primary font-label-caps text-label-caps uppercase tracking-widest mb-xs">
          Reusable Components
        </p>
        <h2 className="font-headline-sm text-[28px] font-bold text-on-surface leading-none">
          Skills
        </h2>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="bg-[#3b82f6] text-white px-lg py-sm rounded font-bold flex items-center gap-sm hover:opacity-90 transition-opacity"
      >
        <Icon name="add_circle" size={20} />
        New Skill
      </button>
    </div>

    {skills.length === 0 ? (
      <div className="bg-[#18181b] border border-[#27272a] rounded p-md text-body-sm text-on-surface-variant">
        No skills yet - click &quot;New Skill&quot; to create one.
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {skills.map((s: any) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              onEdit({
                id: s.id,
                label: s.label ?? s.id,
                description: s.description ?? "",
                category: s.category ?? "custom",
                content: s.content ?? "",
                version: s.version,
                targetAgents: s.targetAgents,
              })
            }
            className="text-left p-md bg-[#18181b] border border-[#27272a] rounded hover:border-primary transition-colors group"
          >
            <div className="flex items-start justify-between gap-sm mb-sm">
              <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center border border-outline-variant shrink-0">
                <Icon name="extension" className="text-primary" size={18} />
              </div>
              {s.version && (
                <span className="font-mono-code text-[10px] text-on-surface-variant bg-surface-container-high px-sm py-0.5 rounded">
                  v{s.version}
                </span>
              )}
            </div>
            <div className="text-body-md font-bold text-on-surface truncate">
              {s.label ?? s.id}
            </div>
            <div className="text-body-sm text-on-surface-variant truncate mt-0.5">
              {s.description || s.id}
            </div>
            {s.category && (
              <span className="inline-block mt-sm font-label-caps text-[10px] uppercase tracking-wider text-primary">
                {s.category}
              </span>
            )}
          </button>
        ))}
      </div>
    )}
  </div>
);

interface EditorViewProps {
  pipelineName: string;
  pipelineData: any;
  agents: any[];
  skills: any[];
  onSave: (data: PipelineEditorData) => void;
  onClose: () => void;
  onRun?: (name: string) => void;
}

const EditorView: React.FC<EditorViewProps> = ({
  pipelineName,
  pipelineData,
  agents,
  skills,
  onSave,
  onClose,
  onRun,
}) => {
  if (!pipelineData?.pipeline) {
    return (
      <div className="p-lg text-body-md text-on-surface-variant">
        Loading pipeline{" "}
        <span className="text-on-surface font-bold">{pipelineName}</span>...
      </div>
    );
  }
  const initialData = pipelineToEditorData(
    pipelineData.name ?? pipelineName,
    pipelineData.pipeline,
    agents,
    skills,
  );
  return (
    <PipelineDetailEditor
      // Pass the **file basename** (stable across edits) as the key so the
      // editor only re-hydrates from the snapshot when the user actually opens
      // a different file — not on every save / list refresh.
      pipelineName={pipelineName}
      initialData={initialData}
      onSave={onSave}
      onClose={onClose}
      onRun={onRun}
    />
  );
};

function pipelineToEditorData(
  name: string,
  raw: any,
  agents: any[],
  skills: any[],
): PipelineEditorData {
  const steps: StepData[] = (raw.steps ?? []).map((s: any) => ({
    id: s.id ?? "",
    name: s.name ?? s.id ?? "",
    agent: s.agent ?? "",
    model: s.model ?? "composer-2",
    gate: s.gate ?? true,
    maxRetries: s.maxRetries ?? 3,
    artifact: s.artifact ?? "",
    loop: s.loop ?? null,
    tags: Array.isArray(s.tags) ? s.tags : [],
    depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
    skills: Array.isArray(s.skills) ? s.skills : [],
  }));
  const agentInfos: AgentInfo[] = (agents ?? []).map((a: any) => ({
    id: a.id,
    label: a.label ?? a.id,
  }));
  const skillInfos: SkillInfo[] = (skills ?? []).map((s: any) => ({
    id: s.id,
    label: s.label ?? s.id,
  }));
  return {
    name: raw.name ?? name,
    version: raw.version ?? "1.0",
    description: raw.description,
    steps,
    agents: agentInfos,
    skills: skillInfos,
    loop_groups: Array.isArray(raw.loop_groups) ? raw.loop_groups : [],
  };
}

function serializePipelineForSave(data: PipelineEditorData): any {
  return {
    name: data.name,
    version: data.version,
    description: data.description,
    execution: { mode: "sequential" },
    steps: data.steps.map((s) => ({
      id: s.id,
      name: s.name,
      agent: s.agent,
      model: s.model,
      gate: s.gate,
      maxRetries: s.maxRetries,
      artifact: s.artifact,
      depends_on: s.depends_on,
      tags: s.tags,
      skills: s.skills,
      ...(s.loop ? { loop: s.loop } : {}),
    })),
    agents: [],
    loop_groups: data.loop_groups,
  };
}

export default App;
