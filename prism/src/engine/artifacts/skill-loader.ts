import * as fs from "fs";
import * as path from "path";
import { SKILLS_DIR } from "../pipeline/schema.js";
import { BUILTIN_SKILLS } from "./builtin-skills.js";

export interface SkillEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  content: string;
  version?: string;
  targetAgents?: string[];
}

export class SkillLoader {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get skillsDir(): string {
    return path.join(this.workspaceRoot, SKILLS_DIR);
  }

  loadAll(): SkillEntry[] {
    if (!fs.existsSync(this.skillsDir)) return [];
    const out: SkillEntry[] = [];
    for (const file of fs.readdirSync(this.skillsDir)) {
      if (!file.endsWith(".md")) continue;
      const raw = fs.readFileSync(path.join(this.skillsDir, file), "utf8");
      const fallbackId = file.replace(/\.md$/, "");
      const parsed = this.parseSkillFile(raw, fallbackId);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  load(skillId: string): SkillEntry | null {
    const filePath = path.join(this.skillsDir, `${skillId}.md`);
    if (!fs.existsSync(filePath)) {
      const builtin = BUILTIN_SKILLS.find((s) => s.id === skillId);
      return builtin ?? null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return this.parseSkillFile(raw, skillId);
  }

  save(skillId: string, content: string): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.skillsDir, `${skillId}.md`),
      content,
      "utf8",
    );
  }

  loadForAgent(agentId: string): SkillEntry[] {
    const all = this.loadAll();
    if (all.length === 0) {
      return BUILTIN_SKILLS.filter(
        (s) =>
          !s.targetAgents ||
          s.targetAgents.length === 0 ||
          s.targetAgents.includes(agentId),
      );
    }
    return all.filter(
      (s) =>
        !s.targetAgents ||
        s.targetAgents.length === 0 ||
        s.targetAgents.includes(agentId),
    );
  }

  buildContext(skillIds: string[]): string {
    const sections: string[] = [];
    for (const id of skillIds) {
      const skill = this.load(id);
      if (!skill) continue;
      sections.push(
        `### Skill: ${skill.label}\n${skill.description}\n\n${skill.content}`,
      );
    }
    return sections.join("\n\n---\n\n");
  }

  buildContextForAgent(skillIds: string[], agentId: string): string {
    const allowed = new Set(this.loadForAgent(agentId).map((s) => s.id));
    return this.buildContext(skillIds.filter((id) => allowed.has(id)));
  }

  syncBuiltinsToDisk(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    for (const skill of BUILTIN_SKILLS) {
      const filePath = path.join(this.skillsDir, `${skill.id}.md`);
      if (fs.existsSync(filePath)) continue;
      const fmLines = [
        "---",
        `id: ${skill.id}`,
        `label: "${skill.label.replace(/"/g, '\\"')}"`,
        `category: ${skill.category}`,
      ];
      if (skill.description) {
        fmLines.push(
          `description: "${skill.description.replace(/"/g, '\\"')}"`,
        );
      }
      if (skill.version) fmLines.push(`version: ${skill.version}`);
      if (skill.targetAgents && skill.targetAgents.length) {
        fmLines.push(`targetAgents: [${skill.targetAgents.join(", ")}]`);
      }
      fmLines.push("---");
      fs.writeFileSync(
        filePath,
        `${fmLines.join("\n")}\n\n${skill.content}\n`,
        "utf8",
      );
    }
  }

  private parseSkillFile(raw: string, fallbackId: string): SkillEntry | null {
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!fmMatch) {
      const body = raw.trim();
      if (!body) return null;
      return {
        id: fallbackId,
        label: fallbackId,
        description: "",
        category: "custom",
        content: body,
      };
    }
    const [, frontmatter, body] = fmMatch;
    const meta: Record<string, string> = {};
    for (const line of frontmatter.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
      if (!m) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      meta[m[1]] = value;
    }

    let targetAgents: string[] | undefined;
    if (meta.targetAgents) {
      const inner = meta.targetAgents.replace(/^\[|\]$/g, "").trim();
      if (inner) {
        targetAgents = inner
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter((s) => s.length > 0);
      }
    }

    return {
      id: meta.id || fallbackId,
      label: meta.label || meta.id || fallbackId,
      description: meta.description || "",
      category: meta.category || "custom",
      content: body.trim(),
      version: meta.version,
      targetAgents,
    };
  }
}
