import * as fs from "fs";
import * as path from "path";
import {
  StepDefinition,
  AgentContext,
  AgentEvent,
  AgentEventType,
} from "../pipeline/schema.js";

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

interface ToolCallRecord {
  name: string;
  callId?: string;
  args: unknown;
  result?: string;
}

const IMPLEMENTATION_TAGS = new Set(["code", "build", "implement", "implementation"]);
const ARTIFACT_PREVIEW_LIMIT = 3000;
const TRACKED_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".jsx", ".css"];
const FILE_PATH_KEYS = [
  "filePath",
  "path",
  "file",
  "filename",
  "target_file",
  "targetFile",
  "destination",
  "dest",
  "output",
  "outputFile",
];

export class CursorSdkStepRunner implements StepRunner {
  private readonly apiKey?: string;
  // Models that the backend has rejected this session — we fall back to
  // "default" rather than retry-and-fail-the-same-way.
  private static unsupportedModels = new Set<string>();

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async run(
    step: StepDefinition,
    context: AgentContext,
    opts: RunnerOptions,
  ): Promise<string> {
    const { cwd, onEvent, signal } = opts;
    const emit = (
      type: AgentEventType,
      content: string,
      meta?: Record<string, unknown>,
    ): void => {
      console.log(`[Runner:${step.id}] ${type}: ${content}`);
      onEvent({
        type,
        stepId: step.id,
        content,
        metadata: meta,
        timestamp: new Date().toISOString(),
      });
    };

    let modelId = step.model;
    if (
      CursorSdkStepRunner.unsupportedModels.has(modelId) &&
      modelId !== "default"
    ) {
      emit(
        "progress",
        `Model "${modelId}" was rejected earlier in this session — falling back to "default" model.`,
      );
      modelId = "default";
    }

    emit(
      "progress",
      `Starting "${step.name}" via Cursor SDK (model: ${modelId}, cwd: ${cwd}, apiKey: ${this.apiKey ? `set, len=${this.apiKey.length}` : "MISSING"})...`,
    );

    if (!this.apiKey) {
      const msg =
        "Cursor SDK requires aidlc.apiKey to be set. Open Settings and add your Cursor API key, then reload the window.";
      emit("error", msg);
      throw new Error(msg);
    }

    let sdkModule: any;
    try {
      sdkModule = await import("@cursor/sdk");
    } catch (err: any) {
      emit("error", `Failed to load @cursor/sdk: ${err?.message ?? err}`);
      throw new Error(`Failed to load @cursor/sdk: ${err?.message ?? err}`);
    }
    const Agent = sdkModule.Agent ?? sdkModule.default?.Agent;
    if (!Agent) {
      const msg = "Cursor SDK loaded but no Agent export found";
      emit("error", msg);
      throw new Error(msg);
    }

    // Per Cursor SDK docs the sandbox is opt-in via ~/.cursor/sandbox.json — do
    // NOT pass sandboxOptions here. The SDK rejects unknown keys on local.
    const agentOpts: any = {
      apiKey: this.apiKey,
      model: { id: modelId },
      local: { cwd },
    };

    let agent: any;
    try {
      agent = await Agent.create(agentOpts);
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "");
      const status = err?.status ?? err?.statusCode;
      const isAuth =
        status === 401 ||
        /AuthenticationError|unauthenticated|\bauth(?:entication)?\b/i.test(
          msg,
        );
      if (isAuth) {
        const friendly =
          "Cursor SDK authentication failed. Run inside Cursor IDE or set aidlc.apiKey for Anthropic fallback.";
        emit("error", friendly);
        throw new Error(friendly);
      }
      emit("error", `Agent.create failed: ${msg}`);
      throw new Error(`Agent.create failed: ${msg}`);
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
      model: modelId,
    });

    const beforeFiles = new Set<string>();
    for (const ext of TRACKED_EXTENSIONS) {
      for (const file of this.scanDirectoryRecursive(cwd, ext)) {
        beforeFiles.add(file);
      }
    }

    let run: any;
    try {
      run = await agent.send(fullPrompt);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      emit("error", `agent.send failed: ${msg}`);
      throw new Error(`agent.send failed: ${msg}`);
    }

    const accumulatedText: string[] = [];
    const toolCalls: ToolCallRecord[] = [];
    let streamError: string | null = null;

    try {
      for await (const msg of run.stream()) {
        if (signal?.aborted) {
          try {
            await run.cancel();
          } catch {
            /* ignore cancel errors */
          }
          break;
        }

        switch (msg.type) {
          case "thinking": {
            emit("thinking", msg.text ?? "");
            break;
          }
          case "assistant": {
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
              if (block.type === "text" && typeof block.text === "string") {
                accumulatedText.push(block.text);
                emit("text", block.text);
              } else if (block.type === "tool_use") {
                toolCalls.push({
                  name: block.name,
                  callId: block.id,
                  args: block.input,
                });
                emit("tool_use", String(block.name), {
                  toolName: block.name,
                  args: block.input,
                });
              }
            }
            break;
          }
          case "tool_call": {
            if (msg.status === "running") {
              emit("tool_use", `${msg.name}...`, { toolName: msg.name });
              toolCalls.push({
                name: msg.name,
                callId: msg.callId,
                args: msg.args,
              });
            } else if (msg.status === "completed") {
              const resultStr =
                typeof msg.result === "string"
                  ? msg.result
                  : JSON.stringify(msg.result ?? "");
              const preview =
                resultStr.length > 200
                  ? resultStr.slice(0, 200) + "…"
                  : resultStr;
              emit("tool_result", preview, {
                toolName: msg.name,
                resultLength: resultStr.length,
              });
              const existing = toolCalls.find(
                (tc) =>
                  tc.callId === msg.callId ||
                  (tc.name === msg.name && !tc.result),
              );
              if (existing) existing.result = resultStr;
              else
                toolCalls.push({
                  name: msg.name,
                  callId: msg.callId,
                  args: msg.args,
                  result: resultStr,
                });
            } else if (msg.status === "error") {
              const errMsg = `Tool error: ${msg.name}: ${msg.error ?? msg.message ?? "unknown"}`;
              emit("error", errMsg);
              streamError = errMsg;
            }
            break;
          }
          case "status": {
            if (msg.status === "FINISHED") {
              emit("done", "Agent finished");
            } else if (msg.status === "ERROR") {
              emit("error", String(msg.message ?? "agent error"));
              streamError = String(msg.message ?? "agent error");
            } else if (
              msg.status === "CANCELLED" ||
              msg.status === "EXPIRED"
            ) {
              emit("error", String(msg.message ?? msg.status));
              streamError = String(msg.message ?? msg.status);
            }
            break;
          }
          default:
            // ignore unknown message types
            break;
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      emit("error", `Stream failed: ${msg}`);
      streamError = msg;
    }

    let runResult: any = null;
    try {
      runResult = await run.wait();
      const duration = runResult?.durationMs ?? 0;
      emit(
        "progress",
        `Agent finished in ${duration}ms (status: ${runResult?.status ?? "unknown"})`,
      );
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      emit("error", `run.wait failed: ${msg}`);
      streamError = streamError ?? msg;
    }

    const artifactPath = path.join(cwd, step.artifact);

    if (
      streamError ||
      runResult?.status === "error" ||
      runResult?.status === "cancelled"
    ) {
      // If the agent run died nearly instantly with an "agent error"-shaped
      // failure, remember the model so the next retry uses "default".
      const errMsgCombined = streamError ?? "";
      const looksLikeModelRejection =
        modelId !== "default" &&
        /agent error|invalid model|unknown model|unsupported model|model.*not.*allow/i.test(
          errMsgCombined,
        );
      if (looksLikeModelRejection) {
        CursorSdkStepRunner.unsupportedModels.add(modelId);
        emit(
          "progress",
          `Model "${modelId}" looks unsupported by the backend — future retries will use "default".`,
        );
      }
      const recovered = await this.recoverAgentWrittenFiles(
        cwd,
        toolCalls,
        beforeFiles,
        artifactPath,
        emit,
      );
      if (recovered && recovered.trim()) return recovered;
      throw new Error(
        streamError ??
          `Agent run ended with status '${runResult?.status ?? "unknown"}'`,
      );
    }

    const streamed = accumulatedText.join("");
    if (streamed.trim()) return streamed;

    if (
      runResult &&
      typeof runResult.result === "string" &&
      runResult.result.trim()
    ) {
      return runResult.result;
    }

    const recovered = await this.recoverAgentWrittenFiles(
      cwd,
      toolCalls,
      beforeFiles,
      artifactPath,
      emit,
    );
    if (recovered && recovered.trim()) return recovered;

    return "";
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

  private async recoverAgentWrittenFiles(
    cwd: string,
    toolCalls: ToolCallRecord[],
    beforeFiles: Set<string>,
    artifactPath: string,
    emit: (
      type: AgentEventType,
      content: string,
      meta?: Record<string, unknown>,
    ) => void,
  ): Promise<string> {
    const writeOps = new Set([
      "write_file",
      "write",
      "edit",
      "edit_file",
      "create_file",
      "save",
      "apply_diff",
      "str_replace",
      "str_replace_based_edit_tool",
    ]);

    const candidates: string[] = [];
    for (const tc of toolCalls) {
      if (!writeOps.has(tc.name)) continue;
      const filePath = this.extractFilePath(tc.args);
      if (filePath) {
        const abs = path.isAbsolute(filePath)
          ? filePath
          : path.join(cwd, filePath);
        candidates.push(abs);
      }
    }

    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, "utf8");
        if (content.trim()) {
          emit("progress", `Recovered output from ${file}`);
          return content;
        }
      } catch {
        /* continue */
      }
    }

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

  private extractFilePath(args: any): string | null {
    if (!args || typeof args !== "object") return null;
    for (const key of FILE_PATH_KEYS) {
      const v = (args as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
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

export class AnthropicStepRunner implements StepRunner {
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(apiKey?: string, model = "claude-sonnet-4-20250514") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async run(
    step: StepDefinition,
    context: AgentContext,
    opts: RunnerOptions,
  ): Promise<string> {
    const { onEvent } = opts;
    const emit = (type: AgentEventType, content: string): void => {
      onEvent({
        type,
        stepId: step.id,
        content,
        timestamp: new Date().toISOString(),
      });
    };

    emit("progress", `Starting "${step.name}" via Anthropic API...`);

    const Anthropic: any = await import("@anthropic-ai/sdk");
    const Ctor = Anthropic.default ?? Anthropic.Anthropic ?? Anthropic;
    const client = new Ctor({ apiKey: this.apiKey });

    const systemPrompt = context.artifacts["system-prompt"]?.body ?? "";
    const userPrompt = this.buildPrompt(step, context);

    const message: any = await client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = (message.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    emit("done", `"${step.name}" complete`);
    return text;
  }

  private buildPrompt(step: StepDefinition, context: AgentContext): string {
    const lines: string[] = [];
    lines.push(`# Step: ${step.name} (${step.id})`);
    lines.push(`Idea: ${context.idea}`);
    lines.push(`Artifact: ${step.artifact}`);
    if (context.skillsContext && context.skillsContext.trim()) {
      lines.push(`\n## Skills\n${context.skillsContext.trim()}`);
    }
    for (const [name, data] of Object.entries(context.artifacts)) {
      if (name === "system-prompt") continue;
      const body = data?.body ?? "";
      if (!body.trim()) continue;
      const truncated =
        body.length > ARTIFACT_PREVIEW_LIMIT
          ? body.slice(0, ARTIFACT_PREVIEW_LIMIT) + "\n…(truncated)"
          : body;
      lines.push(`\n## Previous Artifact: ${name}\n${truncated}`);
    }
    lines.push(
      `\n## Output\nWrite the complete output for this step. The artifact will be saved to \`${step.artifact}\`.`,
    );
    return lines.join("\n");
  }
}
