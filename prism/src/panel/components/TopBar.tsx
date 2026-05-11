import React from "react";
import { Icon } from "./Icon.js";

interface TopBarProps {
  title: string;
  subtitle?: string;
  /** Show a back button when provided. */
  onBack?: () => void;
  /** Connection indicator */
  connected: boolean;
  /** Optional centered search slot. */
  searchPlaceholder?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  onBack,
  connected,
  searchPlaceholder,
  searchValue,
  onSearch,
}) => {
  return (
    <header className="sticky top-0 z-30 flex justify-between items-center px-lg py-sm w-full bg-surface border-b border-outline-variant">
      <div className="flex items-center gap-md min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="p-xs text-on-surface-variant hover:text-primary transition-colors"
          >
            <Icon name="arrow_back" size={20} />
          </button>
        )}
        <div className="min-w-0 flex items-baseline gap-sm">
          <span className="font-headline-sm text-headline-sm font-bold text-primary truncate">
            {title}
          </span>
          {subtitle && (
            <span className="font-mono-code text-[11px] text-on-surface-variant truncate">
              {subtitle}
            </span>
          )}
        </div>

        {onSearch && (
          <div className="relative hidden lg:block ml-md">
            <Icon
              name="search"
              size={18}
              className="absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              type="text"
              value={searchValue ?? ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder ?? "Search..."}
              className="bg-[#0e0e11] border border-outline-variant rounded pl-lg pr-sm py-xs text-body-sm focus:border-primary focus:ring-1 focus:ring-primary w-64 outline-none transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs text-[10px] uppercase tracking-wider">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-secondary animate-pulse" : "bg-outline"}`}
          />
          <span className="text-on-surface-variant">
            {connected ? "Connected" : "Connecting"}
          </span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
