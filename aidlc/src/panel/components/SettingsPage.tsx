import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.js";

export interface AidlcSettings {
  apiKey: string;
  model: string;
  modelOverride: string;
  maxTokens: number;
  autoApproveYolo: boolean;
  gitignoreArtifacts: boolean;
  gateTimeout: number;
  commandConfirmation: boolean;
}

export interface AidlcVerifyResult {
  status: "ok" | "error";
  apiKeyLen?: number;
  modelsCount?: number;
  testRunMs?: number;
  message?: string;
}

interface SettingsPageProps {
  settings: AidlcSettings | null;
  verifyResult: AidlcVerifyResult | null;
  verifyInFlight: boolean;
  onSave: (next: Partial<AidlcSettings>) => void;
  onVerify: () => void;
  onRequestRefresh: () => void;
}

const MODELS = [
  "default",
  "composer-2",
  "composer-1.5",
  "claude-sonnet-4-20250514",
  "claude-3.5-haiku-20241022",
  "gpt-4o-2024-11-20",
  "gpt-4o-mini-2024-07-18",
  "gemini-2.0-flash-001",
  "gemini-2.5-pro-exp-03-25",
];

const EMPTY: AidlcSettings = {
  apiKey: "",
  model: "composer-2",
  modelOverride: "",
  maxTokens: 8192,
  autoApproveYolo: false,
  gitignoreArtifacts: false,
  gateTimeout: 0,
  commandConfirmation: true,
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  verifyResult,
  verifyInFlight,
  onSave,
  onVerify,
  onRequestRefresh,
}) => {
  const [draft, setDraft] = useState<AidlcSettings>(settings ?? EMPTY);
  const [revealKey, setRevealKey] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Refs for refresh + dirty tracking so we don't reset the user's input
  // every time the parent re-renders (which churns the inline callbacks).
  const refreshOnceRef = useRef(false);
  const refreshRef = useRef(onRequestRefresh);
  refreshRef.current = onRequestRefresh;
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (refreshOnceRef.current) return;
    refreshOnceRef.current = true;
    refreshRef.current();
  }, []);

  // Only adopt server-side settings when the user has no pending local edits.
  // Otherwise typing into the API key field would lose every keystroke as soon
  // as the server echoed the previous value back.
  useEffect(() => {
    if (!settings) return;
    if (dirtyRef.current) return;
    setDraft(settings);
  }, [settings]);

  const dirty =
    !!settings &&
    (Object.keys(draft) as (keyof AidlcSettings)[]).some(
      (k) => draft[k] !== settings[k],
    );
  dirtyRef.current = dirty;

  const update = <K extends keyof AidlcSettings>(
    key: K,
    value: AidlcSettings[K],
  ): void => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (): void => {
    onSave(draft);
    setSavedAt(Date.now());
  };

  const apiKeyMasked = draft.apiKey
    ? revealKey
      ? draft.apiKey
      : `••••••••${draft.apiKey.slice(-4)}`
    : "";

  return (
    <div className="p-lg max-w-3xl mx-auto space-y-lg">
      <div>
        <p className="text-primary font-label-caps text-label-caps uppercase tracking-widest mb-xs">
          Workspace Configuration
        </p>
        <h2 className="font-headline-sm text-[32px] font-bold text-on-surface leading-none">
          Settings
        </h2>
        <p className="text-on-surface-variant text-body-sm mt-xs">
          Stored in VS Code workspace settings under <code>aidlc.*</code>.
        </p>
      </div>

      {/* API Key */}
      <section className="bg-[#18181b] border border-[#27272a] rounded p-lg space-y-md">
        <header className="flex items-center gap-sm">
          <Icon name="vpn_key" className="text-primary" size={20} />
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Cursor API Key
          </h3>
        </header>
        <p className="text-on-surface-variant text-body-sm">
          Required for the Cursor SDK runner. Get a key from{" "}
          <code>cursor.com → Account → API Keys</code>.
        </p>
        <div>
          <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
            API Key
          </label>
          <div className="flex gap-sm items-stretch">
            <input
              type={revealKey ? "text" : "password"}
              value={revealKey ? draft.apiKey : draft.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="key_..."
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-surface-container-high border border-outline-variant text-on-surface text-body-md font-mono-code rounded p-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setRevealKey((v) => !v)}
              className="px-md border border-outline-variant text-on-surface-variant rounded text-body-sm hover:border-primary hover:text-on-surface transition-colors flex items-center gap-xs shrink-0"
              title={revealKey ? "Hide" : "Reveal"}
            >
              <Icon name={revealKey ? "visibility_off" : "visibility"} size={16} />
              {revealKey ? "Hide" : "Show"}
            </button>
          </div>
          {!revealKey && draft.apiKey && (
            <div className="text-[11px] text-on-surface-variant font-mono-code mt-xs">
              {apiKeyMasked} ({draft.apiKey.length} chars)
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-sm pt-sm">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="bg-[#3b82f6] text-white px-lg py-sm rounded font-bold text-body-sm flex items-center gap-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Icon name="save" size={16} />
            Save Settings
          </button>
          <button
            type="button"
            onClick={onVerify}
            disabled={verifyInFlight || !draft.apiKey}
            className="border border-outline-variant text-on-surface px-lg py-sm rounded font-bold text-body-sm flex items-center gap-xs hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={
              draft.apiKey
                ? "Run AIDLC: Verify Cursor SDK"
                : "Save an API key first"
            }
          >
            <Icon name={verifyInFlight ? "hourglass_empty" : "fact_check"} size={16} />
            {verifyInFlight ? "Verifying..." : "Verify SDK"}
          </button>
          {savedAt && !dirty && (
            <span className="text-secondary text-body-sm self-center flex items-center gap-xs">
              <Icon name="check_circle" filled size={16} />
              Saved
            </span>
          )}
        </div>

        {verifyResult && (
          <div
            className={`mt-sm rounded p-sm border text-body-sm ${
              verifyResult.status === "ok"
                ? "border-secondary/40 bg-secondary/10 text-on-surface"
                : "border-error/40 bg-error/10 text-error"
            }`}
          >
            <div className="font-bold flex items-center gap-xs">
              <Icon
                name={
                  verifyResult.status === "ok" ? "check_circle" : "error"
                }
                filled
                size={16}
              />
              {verifyResult.status === "ok"
                ? "Cursor SDK reachable"
                : "Cursor SDK check failed"}
            </div>
            {verifyResult.status === "ok" && (
              <ul className="mt-xs text-[12px] font-mono-code text-on-surface-variant space-y-1">
                {typeof verifyResult.apiKeyLen === "number" && (
                  <li>apiKey: set (length {verifyResult.apiKeyLen})</li>
                )}
                {typeof verifyResult.modelsCount === "number" && (
                  <li>models reachable: {verifyResult.modelsCount}</li>
                )}
                {typeof verifyResult.testRunMs === "number" && (
                  <li>composer-2 PONG run: {verifyResult.testRunMs}ms</li>
                )}
              </ul>
            )}
            {verifyResult.message && (
              <pre className="mt-xs text-[11px] whitespace-pre-wrap font-mono-code">
                {verifyResult.message}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* Runner defaults */}
      <section className="bg-[#18181b] border border-[#27272a] rounded p-lg space-y-md">
        <header className="flex items-center gap-sm">
          <Icon name="tune" className="text-primary" size={20} />
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Runner Defaults
          </h3>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div>
            <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
              Default Model
            </label>
            <select
              value={draft.model}
              onChange={(e) => update("model", e.target.value)}
              className="w-full bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-sm focus:border-primary outline-none"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
              Model Override (freeform)
            </label>
            <input
              type="text"
              value={draft.modelOverride}
              onChange={(e) => update("modelOverride", e.target.value)}
              placeholder="leave blank to use Default Model"
              className="w-full bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-sm focus:border-primary outline-none font-mono-code"
            />
          </div>
          <div>
            <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
              Max Tokens
            </label>
            <input
              type="number"
              min={256}
              max={200000}
              value={draft.maxTokens}
              onChange={(e) => update("maxTokens", Number(e.target.value))}
              className="w-full bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-sm focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-xs block">
              Gate Timeout (seconds, 0 = none)
            </label>
            <input
              type="number"
              min={0}
              max={86400}
              value={draft.gateTimeout}
              onChange={(e) => update("gateTimeout", Number(e.target.value))}
              className="w-full bg-surface-container-high border border-outline-variant text-on-surface text-body-sm rounded p-sm focus:border-primary outline-none"
            />
          </div>
        </div>

        <div className="space-y-sm pt-sm">
          <ToggleRow
            label="Auto-approve YOLO tasks"
            hint="Skip the human gate for steps tagged 'yolo'."
            checked={draft.autoApproveYolo}
            onChange={(v) => update("autoApproveYolo", v)}
          />
          <ToggleRow
            label="Add .aidlc/ to .gitignore"
            hint="Keep generated artifacts out of git."
            checked={draft.gitignoreArtifacts}
            onChange={(v) => update("gitignoreArtifacts", v)}
          />
          <ToggleRow
            label="Confirm shell commands"
            hint="Prompt before any agent-issued shell command runs."
            checked={draft.commandConfirmation}
            onChange={(v) => update("commandConfirmation", v)}
          />
        </div>

        <div className="pt-sm">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="bg-[#3b82f6] text-white px-lg py-sm rounded font-bold text-body-sm flex items-center gap-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Icon name="save" size={16} />
            Save Settings
          </button>
        </div>
      </section>
    </div>
  );
};

const ToggleRow: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <div className="flex items-center justify-between gap-md">
    <div className="min-w-0">
      <div className="text-body-sm font-bold text-on-surface">{label}</div>
      <div className="text-[11px] text-on-surface-variant">{hint}</div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
        checked ? "bg-secondary" : "bg-surface-container-highest"
      }`}
    >
      <span
        className={`block w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  </div>
);

export default SettingsPage;
