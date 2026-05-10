import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  PipelineDefinition,
  PipelineDefinitionSchema,
  AGENTS_DIR,
  PIPELINE_CONFIG_DIR,
} from "./schema.js";

export interface LoaderOptions {
  workspaceRoot: string;
}

export class PipelineLoader {
  private readonly workspaceRoot: string;

  constructor(options: LoaderOptions) {
    this.workspaceRoot = options.workspaceRoot;
  }

  private get pipelinesDir(): string {
    return path.join(this.workspaceRoot, PIPELINE_CONFIG_DIR);
  }

  private get agentsDir(): string {
    return path.join(this.workspaceRoot, AGENTS_DIR);
  }

  listPipelines(): string[] {
    if (!fs.existsSync(this.pipelinesDir)) return [];
    return fs
      .readdirSync(this.pipelinesDir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .map((f) => f.replace(/\.(ya?ml)$/, ""));
  }

  loadPipeline(name: string): PipelineDefinition {
    const filePath = this.resolveYamlPath(name);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: unknown = yaml.parse(raw);
    const result = PipelineDefinitionSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Pipeline '${name}' failed validation:\n${issues}`,
      );
    }
    return result.data;
  }

  savePipeline(name: string, pipeline: PipelineDefinition): void {
    if (!fs.existsSync(this.pipelinesDir)) {
      fs.mkdirSync(this.pipelinesDir, { recursive: true });
    }
    const text = yaml.stringify(pipeline, { indent: 2 });
    fs.writeFileSync(path.join(this.pipelinesDir, `${name}.yaml`), text, "utf8");
  }

  deletePipeline(name: string): void {
    const yamlPath = path.join(this.pipelinesDir, `${name}.yaml`);
    const ymlPath = path.join(this.pipelinesDir, `${name}.yml`);
    if (fs.existsSync(yamlPath)) fs.unlinkSync(yamlPath);
    else if (fs.existsSync(ymlPath)) fs.unlinkSync(ymlPath);
  }

  loadAgent(agentId: string): string | null {
    const filePath = path.join(this.agentsDir, `${agentId}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  }

  saveAgent(agentId: string, content: string): void {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(this.agentsDir, `${agentId}.md`), content, "utf8");
  }

  listAgents(): string[] {
    if (!fs.existsSync(this.agentsDir)) return [];
    return fs
      .readdirSync(this.agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  }

  private resolveYamlPath(name: string): string {
    const candidates = [
      path.join(this.pipelinesDir, `${name}.yaml`),
      path.join(this.pipelinesDir, `${name}.yml`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    const available = this.listPipelines();
    const list = available.length ? available.join(", ") : "(none)";
    throw new Error(
      `Pipeline '${name}' not found in ${this.pipelinesDir}. Available: ${list}`,
    );
  }
}
