import React from "react";
import { Icon } from "./Icon.js";

export type SidebarTab =
  | "pipelines"
  | "runs"
  | "editor"
  | "skills"
  | "settings";

interface NavItem {
  id: SidebarTab;
  label: string;
  icon: string;
  /** Disable until user picks a pipeline (Editor only). */
  requiresPipeline?: boolean;
}

const NAV: NavItem[] = [
  { id: "pipelines", label: "Pipelines", icon: "account_tree" },
  { id: "runs", label: "Runs", icon: "play_arrow" },
  { id: "editor", label: "Editor", icon: "edit", requiresPipeline: true },
  { id: "skills", label: "Skills", icon: "extension" },
  { id: "settings", label: "Settings", icon: "settings" },
];

interface SidebarProps {
  active: SidebarTab;
  hasSelectedPipeline: boolean;
  onNavigate: (tab: SidebarTab) => void;
  onCreatePipeline: () => void;
  /** Open the global "Start Run" modal (pipeline picker + idea prompt). */
  onStartRun?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  hasSelectedPipeline,
  onNavigate,
  onCreatePipeline,
  onStartRun,
}) => {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 z-40 flex flex-col p-panel-padding bg-surface-container-low border-r border-outline-variant">
      {/* Brand */}
      <div className="mb-lg px-sm">
        <div className="flex items-center gap-sm">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
            <Icon name="terminal" className="text-on-primary" size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="font-headline-sm text-headline-sm font-semibold text-on-surface truncate">
              PRISM
            </h1>
            <p className="text-[10px] text-on-surface-variant leading-none">
              Pipeline Engine
            </p>
          </div>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 space-y-xs">
        {NAV.map((item) => {
          const disabled = item.requiresPipeline && !hasSelectedPipeline;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onNavigate(item.id)}
              className={[
                "w-full flex items-center gap-sm px-sm py-sm rounded transition-all text-body-md",
                isActive
                  ? "bg-secondary-container text-on-secondary-container border-l-2 border-secondary font-bold"
                  : "text-on-surface-variant hover:bg-surface-container-high",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              <Icon name={item.icon} filled={isActive} size={18} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer actions */}
      <div className="mt-auto pt-lg space-y-xs">
        {onStartRun && (
          <button
            type="button"
            onClick={onStartRun}
            className="w-full bg-primary text-on-primary font-bold py-sm rounded flex items-center justify-center gap-xs hover:opacity-90 transition-opacity"
            title="Pick a pipeline and start a new run"
          >
            <Icon name="play_arrow" filled size={18} />
            Start Run
          </button>
        )}
        <button
          type="button"
          onClick={onCreatePipeline}
          className="w-full bg-[#3b82f6] text-white font-bold py-sm rounded flex items-center justify-center gap-xs hover:opacity-90 transition-opacity"
        >
          <Icon name="add" size={18} />
          New Pipeline
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
