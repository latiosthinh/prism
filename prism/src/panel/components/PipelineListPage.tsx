import React from "react";
import { Icon } from "./Icon.js";
import type { PipelineSummary } from "../hooks/useExtensionState.js";

interface PipelineListPageProps {
  pipelines: PipelineSummary[];
  onSelect: (name: string) => void;
  onEdit: (name: string) => void;
  onCreateFromTemplate: (template: string) => void;
  onCreateNew: () => void;
  onRefresh?: () => void;
}

interface TemplateCard {
  key: string;
  title: string;
  description: string;
  stepCount: number;
  icon: string;
  /** Tailwind utility for icon color */
  accent: string;
}

const TEMPLATES: TemplateCard[] = [
  {
    key: "default",
    title: "Full SDLC",
    description:
      "Comprehensive workflow: Idea \u2192 Requirements \u2192 Design \u2192 Tasks \u2192 Implement \u2192 Build Verify \u2192 Test \u2192 Report.",
    stepCount: 8,
    icon: "rocket_launch",
    accent: "text-secondary",
  },
  {
    key: "feature-build",
    title: "Feature Build",
    description: "Quick path: Design \u2192 Implement \u2192 Test.",
    stepCount: 3,
    icon: "extension",
    accent: "text-primary",
  },
  {
    key: "code-review",
    title: "Code Review",
    description: "Two-step audit: Review \u2192 Report.",
    stepCount: 2,
    icon: "rate_review",
    accent: "text-tertiary",
  },
  {
    key: "bug-fix",
    title: "Bug Fix",
    description: "Triage \u2192 Fix \u2192 Verify.",
    stepCount: 3,
    icon: "pest_control",
    accent: "text-error",
  },
  {
    key: "full-stack-feature",
    title: "Full-Stack Feature",
    description: "Design \u2192 UI \u2192 Implement \u2192 Test \u2192 Docs \u2192 Security.",
    stepCount: 6,
    icon: "layers",
    accent: "text-primary",
  },
  {
    key: "refactor",
    title: "Refactor",
    description: "Analyze \u2192 Plan \u2192 Refactor \u2192 Verify.",
    stepCount: 4,
    icon: "build",
    accent: "text-tertiary",
  },
  {
    key: "prd-to-prototype",
    title: "PRD \u2192 Prototype",
    description: "Brainstorm \u2192 Requirements \u2192 Design \u2192 Prototype.",
    stepCount: 4,
    icon: "auto_awesome",
    accent: "text-secondary",
  },
];

const PIPELINE_ICONS = ["web", "security", "database", "code", "memory", "build"];
const pipelineIcon = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) | 0;
  return PIPELINE_ICONS[Math.abs(hash) % PIPELINE_ICONS.length];
};

export const PipelineListPage: React.FC<PipelineListPageProps> = ({
  pipelines,
  onSelect,
  onEdit,
  onCreateFromTemplate,
  onCreateNew,
  onRefresh,
}) => {
  const totalCount = pipelines.length;

  return (
    <div className="p-lg max-w-7xl mx-auto space-y-lg">
      {/* Page header */}
      <div className="flex justify-between items-end gap-md flex-wrap">
        <div>
          <p className="text-primary font-label-caps text-label-caps uppercase tracking-widest mb-xs">
            Management Console
          </p>
          <h2 className="font-headline-sm text-[32px] font-bold text-on-surface leading-none">
            Pipelines
          </h2>
        </div>
        <div className="flex items-center gap-sm">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="border border-outline-variant text-on-surface-variant hover:border-primary hover:text-on-surface px-md py-sm rounded font-bold text-body-sm transition-colors flex items-center gap-xs"
              title="Refresh pipeline list"
            >
              <Icon name="refresh" size={16} />
              Refresh
            </button>
          )}
          <button
            type="button"
            onClick={onCreateNew}
            className="bg-[#3b82f6] text-white px-lg py-sm rounded font-bold flex items-center gap-sm hover:opacity-90 transition-opacity"
          >
            <Icon name="add_circle" size={20} />
            New Pipeline
          </button>
        </div>
      </div>

      {/* Template Gallery */}
      <section className="space-y-md">
        <div className="flex items-center gap-sm">
          <Icon name="auto_awesome" className="text-primary" size={20} />
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Template Gallery
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {TEMPLATES.map((t) => (
            <article
              key={t.key}
              className="bg-[#18181b] border border-[#27272a] rounded p-md flex flex-col group hover:border-primary transition-colors"
            >
              <div className="flex justify-between items-start mb-md">
                <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center border border-outline-variant">
                  <Icon name={t.icon} className={t.accent} size={20} />
                </div>
                <span className="text-on-surface-variant font-mono-code text-[11px] bg-surface-container-high px-sm py-1 rounded">
                  {t.stepCount} STEPS
                </span>
              </div>
              <h4 className="text-on-surface font-bold text-body-md mb-1">
                {t.title}
              </h4>
              <p className="text-on-surface-variant text-body-sm mb-lg flex-1">
                {t.description}
              </p>
              <div className="mt-auto flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onCreateFromTemplate(t.key)}
                  className="text-secondary hover:underline font-bold text-body-sm flex items-center gap-xs"
                >
                  Create
                  <Icon name="arrow_forward" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Your Pipelines */}
      <section className="space-y-md">
        <div className="flex items-center justify-between gap-md flex-wrap">
          <div className="flex items-center gap-sm">
            <Icon name="list" className="text-primary" size={20} />
            <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Your Pipelines
            </h3>
          </div>
          <div className="flex items-center gap-md text-[11px] font-mono-code text-on-surface-variant">
            <span className="flex items-center gap-xs">
              <span className="w-2 h-2 rounded-full bg-outline" />
              {totalCount} Total
            </span>
          </div>
        </div>

        {pipelines.length === 0 ? (
          <div className="bg-[#18181b] border border-[#27272a] rounded p-md text-body-sm text-on-surface-variant">
            No pipelines yet - create one from a template above.
          </div>
        ) : (
          <div className="bg-[#18181b] border border-[#27272a] rounded divide-y divide-[#27272a]">
            {pipelines.map((p) => (
              <div
                key={p.name}
                className="flex items-center p-md group transition-colors hover:bg-surface-container-low"
              >
                <div className="w-10 h-10 rounded flex items-center justify-center bg-surface-container border border-outline-variant mr-md shrink-0">
                  <Icon
                    name={pipelineIcon(p.name)}
                    className="text-primary"
                    size={20}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-sm flex-wrap">
                    <h5 className="text-on-surface font-bold text-body-md truncate">
                      {p.displayName ?? p.name}
                    </h5>
                    {p.displayName && p.displayName !== p.name && (
                      <span
                        className="text-on-surface-variant font-mono-code text-[11px] bg-surface-container-high px-sm py-0.5 rounded"
                        title="Pipeline file name"
                      >
                        {p.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-md mt-1 flex-wrap">
                    <span className="text-on-surface-variant text-body-sm flex items-center gap-xs">
                      <Icon name="layers" size={14} />
                      {p.stepCount} Steps
                    </span>
                    {p.description && (
                      <span className="text-on-surface-variant text-body-sm flex items-center gap-xs truncate">
                        <Icon name="history" size={14} />
                        {p.description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-sm shrink-0 ml-sm">
                  <button
                    type="button"
                    onClick={() => onSelect(p.name)}
                    className="bg-[#3b82f6] text-white px-md py-1.5 rounded font-bold text-body-sm flex items-center gap-xs hover:opacity-90 transition-opacity"
                  >
                    <Icon name="play_arrow" filled size={16} />
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(p.name)}
                    className="border border-[#27272a] text-on-surface-variant hover:border-primary hover:text-on-surface px-md py-1.5 rounded font-bold text-body-sm transition-colors flex items-center gap-xs"
                  >
                    <Icon name="edit" size={16} />
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PipelineListPage;
