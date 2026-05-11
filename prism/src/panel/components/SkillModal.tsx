import React, { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { Icon } from "./Icon.js";

export interface SkillEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  content: string;
  version?: string;
  targetAgents?: string[];
}

interface SkillModalProps {
  skill: SkillEntry | null;
  onSave: (id: string, content: string) => void;
  onClose: () => void;
}

export const SkillModal: React.FC<SkillModalProps> = ({
  skill,
  onSave,
  onClose,
}) => {
  const isNew = !skill;
  const [id, setId] = useState(skill?.id ?? "");
  const [label, setLabel] = useState(skill?.label ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [category, setCategory] = useState(skill?.category ?? "custom");
  const [version, setVersion] = useState(skill?.version ?? "1.0.0");
  const [targetAgents, setTargetAgents] = useState(
    (skill?.targetAgents ?? []).join(", "),
  );
  const [content, setContent] = useState(skill?.content ?? "");

  useEffect(() => {
    setId(skill?.id ?? "");
    setLabel(skill?.label ?? "");
    setDescription(skill?.description ?? "");
    setCategory(skill?.category ?? "custom");
    setVersion(skill?.version ?? "1.0.0");
    setTargetAgents((skill?.targetAgents ?? []).join(", "));
    setContent(skill?.content ?? "");
  }, [skill]);

  const previewHtml = useMemo(
    () => marked.parse(content || "_(empty)_", { async: false }) as string,
    [content],
  );

  const handleSave = (): void => {
    const targets = targetAgents
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const fmLines = ["---", `id: ${id}`, `label: "${label.replace(/"/g, '\\"')}"`];
    if (description)
      fmLines.push(`description: "${description.replace(/"/g, '\\"')}"`);
    fmLines.push(`category: ${category}`);
    if (version) fmLines.push(`version: ${version}`);
    if (targets.length) fmLines.push(`targetAgents: [${targets.join(", ")}]`);
    fmLines.push("---");
    const full = `${fmLines.join("\n")}\n\n${content}\n`;
    onSave(id, full);
  };

  const idValid = /^[a-z0-9-]+$/.test(id);

  const inputClass =
    "w-full px-sm py-1.5 bg-background border border-outline-variant rounded text-on-surface text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-lg">
      <div className="bg-[#18181b] border border-[#27272a] rounded w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant">
          <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface flex items-center gap-sm">
            <Icon name="extension" className="text-primary" size={18} />
            {isNew ? "New Skill" : `Edit Skill: ${skill?.label}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-xs"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-md p-md overflow-auto">
          <div className="space-y-md">
            <Field label="ID">
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={!isNew}
                className={`${inputClass} ${!idValid ? "border-error" : ""}`}
              />
            </Field>
            <Field label="Label">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${inputClass} resize-y`}
              />
            </Field>
            <Field label="Category">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Version">
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className={`${inputClass} font-mono-code`}
              />
            </Field>
            <Field label="Target Agents (comma-separated)">
              <input
                type="text"
                value={targetAgents}
                onChange={(e) => setTargetAgents(e.target.value)}
                placeholder="executor, architect"
                className={inputClass}
              />
            </Field>
            <Field label="Content (markdown)">
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={`${inputClass} font-mono-code text-mono-code resize-y`}
              />
            </Field>
          </div>

          <div className="space-y-sm">
            <div className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
              Preview
            </div>
            <div
              className="bg-surface-container-lowest border border-outline-variant rounded p-md prose prose-invert prose-sm max-w-none text-on-surface max-h-[60vh] overflow-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-sm px-md py-sm border-t border-outline-variant">
          <button
            type="button"
            onClick={onClose}
            className="px-md py-1.5 text-body-sm font-bold border border-outline-variant text-on-surface-variant hover:border-primary hover:text-on-surface rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!idValid || !label}
            className="px-md py-1.5 text-body-sm font-bold bg-primary text-on-primary rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Skill
          </button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <div className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant mb-1">
      {label}
    </div>
    {children}
  </div>
);

export default SkillModal;
