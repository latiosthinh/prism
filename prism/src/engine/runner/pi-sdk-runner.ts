import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  StepDefinition,
  AgentContext,
  AgentEvent,
  AgentEventType,
  StepRunResult,
} from "../pipeline/schema.js";
import { OpenCodeAgent } from "@prism/sdk";
import { extractUsage, computeCost } from "@prism/sdk";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

export interface PiSdkRunnerConfig {
  apiKey?: string;
  provider?: string;
  model?: string;
  allowedCommands?: string[];
}

export interface RunnerOptions {
  cwd: string;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface StepRunner {
  run(
    step: StepDefinition,
    context: AgentContext,
    opts: RunnerOptions,
  ): Promise<string>;
}

const IMPLEMENTATION_TAGS = new Set(["code", "build", "implement", "implementation"]);
const ARTIFACT_PREVIEW_LIMIT = 3000;
const TRACKED_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".jsx", ".css"];

export class PiSdkStepRunner implements StepRunner {
  private readonly config: PiSdkRunnerConfig;

  constructor(config: PiSdkRunnerConfig) {
    this.config = {
      provider: config.provider || "anthropic",
      model: config.model || "claude-sonnet-4-20250514",
      apiKey: config.apiKey,
      allowedCommands: config.allowedCommands || ["ls", "cat", "grep", "find", "head", "tail", "wc", "echo", "mkdir", "touch", "npm", "node", "python", "git", "cp", "mv", "rm"],
    };
  }

  async run(
    step: StepDefinition,
    context: AgentContext,
    opts: RunnerOptions,
  ): Promise<StepRunResult> {
    const { cwd, onEvent, signal } = opts;
    const emit = (
      type: AgentEventType,
      content: string,
      meta?: Record<string, unknown>,
    ): void => {
      console.log(`[PiRunner:${step.id}] ${type}: ${content}`);
      onEvent({
        type,
        stepId: step.id,
        content,
        metadata: meta,
        timestamp: new Date().toISOString(),
      });
    };

    emit(
      "progress",
      `Starting "${step.name}" via Pi SDK (provider: ${this.config.provider}, model: ${this.config.model})...`,
    );

    if (!this.config.apiKey) {
      const msg = "Pi SDK requires prism.piApiKey to be set. Open Settings and add your API key.";
      emit("error", msg);
      throw new Error(msg);
    }

    const systemPrompt = context.artifacts["system-prompt"]?.body ?? "";
    const userPrompt = this.buildPrompt(step, context);
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    emit("prompt", fullPrompt, {
      systemPrompt,
      userPrompt,
      idea: context.idea,
      model: this.config.model,
    });

    const beforeFiles = new Set<string>();
    for (const ext of TRACKED_EXTENSIONS) {
      for (const file of this.scanDirectoryRecursive(cwd, ext)) {
        beforeFiles.add(file);
      }
    }

    const tools = this.createTools(cwd, emit);

    const agent = new OpenCodeAgent({
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      systemPrompt: systemPrompt || undefined,
      tools,
    });

    let accumulatedText = "";
    let streamError: string | null = null;
    let agentResult: any = null;

    agent.on("text_delta", (event: any) => {
      accumulatedText += event.delta || "";
      emit("text", event.delta || "");
    });

    agent.on("thinking_delta", (event: any) => {
      emit("thinking", event.delta || "");
    });

    agent.on("tool_call_start", (event: any) => {
      emit("tool_use", `${event.toolName}...`, {
        toolName: event.toolName,
        args: event.args,
      });
    });

    agent.on("tool_call_end", (event: any) => {
      const resultStr = typeof event.result === "string"
        ? event.result
        : JSON.stringify(event.result ?? "");
      const preview = resultStr.length > 200
        ? resultStr.slice(0, 200) + "…"
        : resultStr;
      emit("tool_result", preview, {
        toolName: event.toolName,
        resultLength: resultStr.length,
      });
    });

    agent.on("agent_error", (event: any) => {
      streamError = event.error || "Unknown error";
      emit("error", streamError);
    });

    agent.on("agent_end", (event: any) => {
      emit("done", "Agent finished");
      agentResult = event?.result;
    });

    try {
      await agent.prompt(fullPrompt);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      emit("error", `Agent prompt failed: ${msg}`);
      streamError = msg;
    }

    const usage = extractUsage(this.config.provider, agentResult?.message ?? {});
    const cost = computeCost(this.config.model, usage.tokensIn, usage.tokensOut, usage.tokensCachedIn);

    const artifactPath = path.join(cwd, step.artifact);

    if (streamError) {
      const recovered = await this.recoverAgentWrittenFiles(
        cwd,
        beforeFiles,
        artifactPath,
        emit,
      );
      if (recovered && recovered.trim()) {
        return { text: recovered, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokensCachedIn: usage.tokensCachedIn, costUsd: cost, provider: this.config.provider, model: this.config.model };
      }
      throw new Error(streamError);
    }

    if (accumulatedText.trim()) {
      return { text: accumulatedText, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokensCachedIn: usage.tokensCachedIn, costUsd: cost, provider: this.config.provider, model: this.config.model };
    }

    const recovered = await this.recoverAgentWrittenFiles(
      cwd,
      beforeFiles,
      artifactPath,
      emit,
    );
    if (recovered && recovered.trim()) {
      return { text: recovered, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokensCachedIn: usage.tokensCachedIn, costUsd: cost, provider: this.config.provider, model: this.config.model };
    }

    return { text: "", tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokensCachedIn: usage.tokensCachedIn, costUsd: cost, provider: this.config.provider, model: this.config.model };
  }

  private buildPrompt(step: StepDefinition, context: AgentContext): string {
    const sections: string[] = [];

    if (context.skillsContext && context.skillsContext.trim()) {
      sections.push(
        `## Skills Context\n\n${context.skillsContext.trim()}`,
      );
    }

    const currentLines: string[] = [
      "## Current Context",
      `- cwd: ${context.cwd}`,
      `- step: ${step.name} (${step.id})`,
    ];
    if (step.tags.length) {
      currentLines.push(`- tags: ${step.tags.join(", ")}`);
    }
    currentLines.push(`- artifact: ${step.artifact}`);
    currentLines.push(`- idea: ${context.idea}`);
    sections.push(currentLines.join("\n"));

    const isImplementation = step.tags.some((t) =>
      IMPLEMENTATION_TAGS.has(t.toLowerCase()),
    );
    if (isImplementation) {
      sections.push(
        `## Output Instructions\n\nThis is an implementation step. Build the actual product: create or modify the source files needed to satisfy the task. After implementing, write a short summary of what you changed to the artifact file: \`${step.artifact}\`. Do not place full code dumps in the artifact — code goes in real source files.`,
      );
    } else {
      sections.push(
        `## Output Instructions\n\nWrite your complete output to the artifact file: \`${step.artifact}\`. The artifact is the source of truth for downstream steps. Use markdown.`,
      );
    }

    const prevArtifactSections: string[] = [];
    for (const [name, data] of Object.entries(context.artifacts)) {
      if (name === "system-prompt") continue;
      const body = data?.body ?? "";
      if (!body.trim()) continue;
      const truncated =
        body.length > ARTIFACT_PREVIEW_LIMIT
          ? body.slice(0, ARTIFACT_PREVIEW_LIMIT) + "\n\n…(truncated)"
          : body;
      prevArtifactSections.push(`### ${name}\n\n${truncated}`);
    }
    if (prevArtifactSections.length) {
      sections.push(
        `## Previous Artifacts\n\n${prevArtifactSections.join("\n\n")}`,
      );
    }

    if (context.tasks && context.tasks.length) {
      const lines = context.tasks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(
          (t) =>
            `- ${t.id} [${t.status}] [${t.mode}] ${t.title} (risk: ${t.risk})`,
        );
      sections.push(`## Tasks\n\n${lines.join("\n")}`);
    }

    if (context.currentTask) {
      const t = context.currentTask;
      const filesLine = t.files?.length ? `\n- files: ${t.files.join(", ")}` : "";
      const depLine = t.dependsOn?.length
        ? `\n- depends on: ${t.dependsOn.join(", ")}`
        : "";
      const reqLine = t.requirementRefs?.length
        ? `\n- implements: ${t.requirementRefs.join(", ")}`
        : "";
      sections.push(
        `## Active Task\n\n**${t.id}: ${t.title}** [${t.mode}] (risk: ${t.risk})\n\n${t.description}${filesLine}${depLine}${reqLine}`,
      );
    }

    return sections.join("\n\n");
  }

  private createTools(cwd: string, emit: (type: AgentEventType, content: string, meta?: Record<string, unknown>) => void): AgentTool<any>[] {
    return [
      {
        name: "read_file",
        label: "Read File",
        description: "Read the contents of a file",
        parameters: Type.Object({
          path: Type.String({ description: "File path relative to cwd" }),
        }),
        execute: async (_toolCallId: string, params: { path: string }) => {
          const absPath = path.isAbsolute(params.path) ? params.path : path.join(cwd, params.path);
          emit("progress", `Reading file: ${absPath}`);
          const content = fs.readFileSync(absPath, "utf8");
          return {
            content: [{ type: "text", text: content }],
            details: { path: absPath, size: content.length },
          };
        },
      },
      {
        name: "write_file",
        label: "Write File",
        description: "Write content to a file",
        parameters: Type.Object({
          path: Type.String({ description: "File path relative to cwd" }),
          content: Type.String({ description: "File content" }),
        }),
        execute: async (_toolCallId: string, params: { path: string; content: string }) => {
          const absPath = path.isAbsolute(params.path) ? params.path : path.join(cwd, params.path);
          const dir = path.dirname(absPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          emit("progress", `Writing file: ${absPath}`);
          fs.writeFileSync(absPath, params.content, "utf8");
          return {
            content: [{ type: "text", text: `File written: ${absPath}` }],
            details: { path: absPath, size: params.content.length },
          };
        },
      },
      {
        name: "edit_file",
        label: "Edit File",
        description: "Edit a file by replacing text",
        parameters: Type.Object({
          path: Type.String({ description: "File path relative to cwd" }),
          oldText: Type.String({ description: "Text to replace" }),
          newText: Type.String({ description: "Replacement text" }),
        }),
        execute: async (_toolCallId: string, params: { path: string; oldText: string; newText: string }) => {
          const absPath = path.isAbsolute(params.path) ? params.path : path.join(cwd, params.path);
          emit("progress", `Editing file: ${absPath}`);
          const content = fs.readFileSync(absPath, "utf8");
          if (!content.includes(params.oldText)) {
            throw new Error(`Text not found in file: ${params.oldText.substring(0, 50)}...`);
          }
          const newContent = content.replace(params.oldText, params.newText);
          fs.writeFileSync(absPath, newContent, "utf8");
          return {
            content: [{ type: "text", text: `File edited: ${absPath}` }],
            details: { path: absPath, replacements: 1 },
          };
        },
      },
      {
        name: "bash",
        label: "Bash",
        description: "Execute a bash command",
        parameters: Type.Object({
          command: Type.String({ description: "Command to execute" }),
        }),
        execute: async (_toolCallId: string, params: { command: string }) => {
          const cmdBinary = params.command.trim().split(/\s+/)[0].replace(/^\.\//, "");
          const allowed = this.config.allowedCommands ?? [];
          const isAllowed = allowed.some((pattern) => {
            if (pattern === cmdBinary) return true;
            if (pattern.includes("*")) {
              const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
              return regex.test(cmdBinary);
            }
            return false;
          });

          if (!isAllowed) {
            const msg = `Command blocked by security policy: "${cmdBinary}" is not in the allowed commands list. Add it to prism.allowedCommands in settings.`;
            emit("error", msg);
            return {
              content: [{ type: "text", text: msg }],
              details: { command: params.command, blocked: true, binary: cmdBinary },
              isError: true,
            };
          }

          emit("progress", `Executing: ${params.command}`);
          try {
            const result = execSync(params.command, {
              cwd,
              encoding: "utf8",
              timeout: 30000,
              maxBuffer: 1024 * 1024,
            });
            return {
              content: [{ type: "text", text: result }],
              details: { command: params.command, exitCode: 0 },
            };
          } catch (error: any) {
            return {
              content: [{ type: "text", text: error.stdout || error.stderr || error.message }],
              details: { command: params.command, exitCode: error.status || 1, error: true },
              isError: true,
            };
          }
        },
      },
    ];
  }

  private async recoverAgentWrittenFiles(
    cwd: string,
    beforeFiles: Set<string>,
    artifactPath: string,
    emit: (type: AgentEventType, content: string, meta?: Record<string, unknown>) => void,
  ): Promise<string> {
    for (const ext of TRACKED_EXTENSIONS) {
      for (const file of this.scanDirectoryRecursive(cwd, ext)) {
        if (beforeFiles.has(file)) continue;
        try {
          const content = fs.readFileSync(file, "utf8");
          if (content.trim()) {
            emit("progress", `Recovered new file: ${file}`);
            return content;
          }
        } catch {
          /* continue */
        }
      }
    }

    try {
      if (fs.existsSync(artifactPath)) {
        const content = fs.readFileSync(artifactPath, "utf8");
        if (content.trim()) {
          emit("progress", `Recovered artifact at ${artifactPath}`);
          return content;
        }
      }
    } catch {
      /* swallow */
    }

    return "";
  }

  private scanDirectoryRecursive(dir: string, extension: string): string[] {
    const out: string[] = [];
    const walk = (current: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          if (entry.name === "node_modules") continue;
          walk(full);
        } else if (entry.isFile()) {
          if (full.endsWith(extension)) out.push(full);
        }
      }
    };
    walk(dir);
    return out;
  }
}
