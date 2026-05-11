import React, { useState } from "react";

export interface RunMeta {
  idea: string;
  title?: string;
  description?: string;
}

interface IdeaInputProps {
  onRun: (meta: RunMeta) => void;
  disabled?: boolean;
  initialValue?: string;
  /** Soft cap shown in the counter - does not block submission. */
  maxChars?: number;
}

export const IdeaInput: React.FC<IdeaInputProps> = ({
  onRun,
  disabled = false,
  initialValue = "",
  maxChars = 2000,
}) => {
  const [idea, setIdea] = useState(initialValue);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showMeta, setShowMeta] = useState(false);

  const handleSubmit = (): void => {
    const trimmed = idea.trim();
    if (!trimmed || disabled) return;
    onRun({
      idea: trimmed,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const overLimit = idea.length > maxChars;

  const inputClass =
    "w-full bg-background border border-outline-variant rounded px-md py-sm text-body-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 transition-colors";

  return (
    <section className="bg-surface-container-low border border-outline-variant rounded p-md">
      <div className="flex justify-between items-center mb-sm">
        <label className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
          Input Definition
        </label>
        <button
          type="button"
          onClick={() => setShowMeta((v) => !v)}
          className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors"
        >
          {showMeta ? "Hide title/description" : "+ Add title & description"}
        </button>
      </div>

      {showMeta && (
        <div className="mb-sm flex flex-col gap-sm">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled}
            placeholder="Title / Run ID - e.g. EPIC-173, feature: dark mode"
            className={inputClass}
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
            placeholder="Description - e.g. bug: fix login error"
            className={inputClass}
          />
        </div>
      )}

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Describe your idea..."
        className="w-full bg-background border border-outline-variant rounded p-md font-mono-code text-mono-code text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[120px] resize-y disabled:opacity-50 transition-colors"
      />

      <div className="mt-md flex justify-between items-center">
        <span
          className={`font-mono-code text-[11px] ${
            overLimit ? "text-error" : "text-outline"
          }`}
        >
          {idea.length} / {maxChars}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || idea.trim().length === 0}
          className="bg-primary text-on-primary px-lg py-sm font-label-caps text-label-caps tracking-widest uppercase rounded font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          Run Pipeline
        </button>
      </div>
    </section>
  );
};

export default IdeaInput;
