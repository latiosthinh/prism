import * as fs from "fs";
import * as path from "path";
import { AGENTS_DIR } from "../pipeline/schema.js";
import {
  getBuiltinAgent,
  listBuiltinAgents,
  BuiltinAgentEntry,
} from "./builtins.js";

export interface AgentLoadResult {
  id: string;
  label: string;
  description: string;
  category: string;
  systemPrompt: string;
  artifactFile?: string;
  source: "file" | "builtin";
}

export class AgentRegistry {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private get agentsDir(): string {
    return path.join(this.workspaceRoot, AGENTS_DIR);
  }

  load(agentId: string): AgentLoadResult | null {
    const fileEntry = this.loadFromFile(agentId);
    if (fileEntry) {
      return { ...fileEntry, source: "file" };
    }
    const builtin = getBuiltinAgent(agentId);
    if (builtin) {
      return {
        id: builtin.id,
        label: builtin.label,
        description: builtin.description,
        category: builtin.category,
        systemPrompt: builtin.systemPrompt,
        artifactFile: builtin.artifactFile,
        source: "builtin",
      };
    }
    return null;
  }

  listAll(): AgentLoadResult[] {
    const seen = new Set<string>();
    const result: AgentLoadResult[] = [];

    for (const entry of this.listFromFiles()) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      result.push({ ...entry, source: "file" });
    }

    for (const builtin of listBuiltinAgents()) {
      if (seen.has(builtin.id)) continue;
      seen.add(builtin.id);
      result.push({
        id: builtin.id,
        label: builtin.label,
        description: builtin.description,
        category: builtin.category,
        systemPrompt: builtin.systemPrompt,
        artifactFile: builtin.artifactFile,
        source: "builtin",
      });
    }

    return result;
  }

  syncBuiltinsToDisk(): void {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
    for (const builtin of listBuiltinAgents()) {
      const filePath = path.join(this.agentsDir, `${builtin.id}.md`);
      if (fs.existsSync(filePath)) continue;
      const frontmatter = this.serializeFrontmatter(builtin);
      const content = `${frontmatter}\n\n${builtin.systemPrompt}\n`;
      fs.writeFileSync(filePath, content, "utf8");
    }
  }

  private serializeFrontmatter(entry: BuiltinAgentEntry): string {
    const lines = [
      "---",
      `id: ${entry.id}`,
      `label: "${entry.label.replace(/"/g, '\\"')}"`,
      `category: ${entry.category}`,
    ];
    if (entry.description) {
      lines.push(`description: "${entry.description.replace(/"/g, '\\"')}"`);
    }
    if (entry.artifactFile) {
      lines.push(`artifactFile: ${entry.artifactFile}`);
    }
    lines.push("---");
    return lines.join("\n");
  }

  private loadFromFile(
    agentId: string,
  ): Omit<AgentLoadResult, "source"> | null {
    const filePath = path.join(this.agentsDir, `${agentId}.md`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return this.parseAgentFile(raw, agentId);
  }

  private listFromFiles(): Omit<AgentLoadResult, "source">[] {
    if (!fs.existsSync(this.agentsDir)) return [];
    const out: Omit<AgentLoadResult, "source">[] = [];
    for (const file of fs.readdirSync(this.agentsDir)) {
      if (!file.endsWith(".md")) continue;
      const raw = fs.readFileSync(path.join(this.agentsDir, file), "utf8");
      const fallbackId = file.replace(/\.md$/, "");
      const parsed = this.parseAgentFile(raw, fallbackId);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  private parseAgentFile(
    raw: string,
    fallbackId: string,
  ): Omit<AgentLoadResult, "source"> | null {
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!fmMatch) {
      const body = raw.trim();
      if (!body) return null;
      return {
        id: fallbackId,
        label: fallbackId,
        description: "",
        category: "custom",
        systemPrompt: body,
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

    return {
      id: meta.id || fallbackId,
      label: meta.label || meta.id || fallbackId,
      description: meta.description || "",
      category: meta.category || "custom",
      systemPrompt: body.trim(),
      artifactFile: meta.artifactFile || undefined,
    };
  }
}
