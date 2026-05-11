import { OpenCodeAgent } from "@prism/sdk";
import type { CliConfig } from "./types.js";
import { createPipelineTools } from "./tools.js";
import { CliEngine } from "./cli-engine.js";

export class PRISMCliAgent {
  private readonly agent: OpenCodeAgent;
  private readonly engine: CliEngine;

  constructor(config: CliConfig) {
    this.engine = new CliEngine(config);
    this.engine.ensureSkeleton();

    const tools = createPipelineTools(this.engine);

    this.agent = new OpenCodeAgent({
      provider: config.provider,
      model: config.model,
      apiKey: config.piApiKey,
      tools,
      systemPrompt: this.buildSystemPrompt(config),
    });
  }

  private buildSystemPrompt(config: CliConfig): string {
    return `You are PRISM, an AI development orchestration assistant. You help users manage and run AI-powered development pipelines.

## Your Capabilities

You have access to tools that let you:
- List, create, and run pipelines
- Check run status and view artifacts
- List available agents and skills
- Read files and execute shell commands in the workspace

## Guidelines

1. When asked about pipelines, use list_pipelines first to see what's available
2. When asked to run a pipeline, confirm the name and idea before executing
3. When a pipeline is running, offer to check status with get_run_status
4. When a pipeline fails, suggest using runs-view to see what went wrong
5. Be concise — show data in structured format when possible
6. Always confirm before running a pipeline unless the user explicitly asked

## Workspace

- Workspace root: ${config.workspace}
- Backend: ${config.backend}
- Provider: ${config.provider}
- Model: ${config.model}

## Pipeline Structure

Pipelines are stored in .PRISM/pipelines/ as YAML files.
Run artifacts are stored in .PRISM/runs/<run-id>/steps/<step-id>/latest.md
Custom agents are in .PRISM/agents/
Custom skills are in .PRISM/skills/`;
  }

  async chat(message: string, onEvent?: (event: { type: string; content: string }) => void): Promise<string> {
    if (onEvent) {
      this.agent.on("text_delta", (event: any) => {
        onEvent({ type: "text", content: event.delta || "" });
      });
      this.agent.on("thinking_delta", (event: any) => {
        onEvent({ type: "thinking", content: event.delta || "" });
      });
      this.agent.on("tool_call_start", (event: any) => {
        onEvent({ type: "tool", content: `Calling ${event.toolName}...` });
      });
    }

    const result = await this.agent.prompt(message);
    return result.message || "";
  }

  getEngine(): CliEngine {
    return this.engine;
  }

  async reset(): Promise<void> {
    await this.agent.reset();
  }

  abort(): void {
    this.agent.abort();
  }
}
