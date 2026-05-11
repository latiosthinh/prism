import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { CliEngine } from "./cli-engine.js";
import type { AgentTool } from "@prism/sdk";
import { Type } from "@earendil-works/pi-ai";

export function createPipelineTools(engine: CliEngine): AgentTool<any>[] {
  return [
    {
      name: "list_pipelines",
      label: "List Pipelines",
      description: "List all available PRISM pipelines in the workspace",
      parameters: Type.Object({}),
      execute: async () => {
        const pipelines = engine.listPipelines();
        return {
          content: [{
            type: "text",
            text: pipelines.map((p) =>
              `- ${p.name}: ${p.stepCount} steps — ${p.description || p.displayName}`
            ).join("\n"),
          }],
          details: { count: pipelines.length },
        };
      },
    },
    {
      name: "create_pipeline",
      label: "Create Pipeline",
      description: "Create a new pipeline from a built-in template",
      parameters: Type.Object({
        template: Type.String({ description: "Template name (default, feature-build, code-review, bug-fix, full-stack-feature, refactor, prd-to-prototype, blank)" }),
      }),
      execute: async (_toolCallId: string, params: { template: string }) => {
        const result = engine.createPipelineFromTemplate(params.template);
        if (!result) {
          return {
            content: [{ type: "text", text: `Template "${params.template}" not found.` }],
            details: { success: false },
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `Pipeline "${result.name}" created from template "${params.template}". File: .PRISM/pipelines/${result.name}.yaml` }],
          details: { success: true, name: result.name },
        };
      },
    },
    {
      name: "run_pipeline",
      label: "Run Pipeline",
      description: "Start executing a pipeline run",
      parameters: Type.Object({
        name: Type.String({ description: "Pipeline name" }),
        idea: Type.String({ description: "Optional idea or context for the run" }),
      }),
      execute: async (_toolCallId: string, params: { name: string; idea?: string }) => {
        const pipelines = engine.listPipelines();
        const pipeline = pipelines.find((p) => p.name === params.name || p.displayName === params.name);
        if (!pipeline) {
          return {
            content: [{ type: "text", text: `Pipeline "${params.name}" not found. Use list_pipelines to see available pipelines.` }],
            details: { success: false },
            isError: true,
          };
        }

        try {
          await engine.runPipeline(params.name, { idea: params.idea || "", title: params.name });
          return {
            content: [{ type: "text", text: `Pipeline "${params.name}" completed successfully.` }],
            details: { success: true },
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Pipeline failed: ${err?.message ?? err}` }],
            details: { success: false, error: err?.message },
            isError: true,
          };
        }
      },
    },
    {
      name: "get_run_status",
      label: "Get Run Status",
      description: "Get the status of the most recent pipeline run",
      parameters: Type.Object({}),
      execute: async () => {
        const runs = engine.listRuns();
        if (runs.length === 0) {
          return {
            content: [{ type: "text", text: "No runs found. Start one with run_pipeline." }],
            details: { count: 0 },
          };
        }
        const latest = runs[0];
        const state = engine.loadRun(latest.runId);
        if (!state) {
          return {
            content: [{ type: "text", text: "Failed to load run state." }],
            details: { success: false },
          };
        }

        const stepLines = state.steps.map((s) =>
          `  ${s.id}: ${s.status}${s.error ? ` (error: ${s.error.slice(0, 50)})` : ""}`
        );
        return {
          content: [{
            type: "text",
            text: `Pipeline: ${state.pipelineName}\nStatus: ${state.status}\nSteps:\n${stepLines.join("\n")}`,
          }],
          details: { runId: latest.runId, status: state.status },
        };
      },
    },
    {
      name: "list_runs",
      label: "List Runs",
      description: "List all past pipeline runs",
      parameters: Type.Object({}),
      execute: async () => {
        const runs = engine.listRuns();
        if (runs.length === 0) {
          return {
            content: [{ type: "text", text: "No runs found." }],
            details: { count: 0 },
          };
        }
        const lines = runs.map((r) =>
          `- ${r.runId.slice(0, 20)}... | ${r.pipelineName} | ${r.status} | ${new Date(r.startedAt).toLocaleString()}`
        );
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { count: runs.length },
        };
      },
    },
    {
      name: "get_run_artifact",
      label: "Get Run Artifact",
      description: "Read the artifact output of a specific step in a run",
      parameters: Type.Object({
        runId: Type.String({ description: "Run ID" }),
        stepId: Type.String({ description: "Step ID" }),
      }),
      execute: async (_toolCallId: string, params: { runId: string; stepId: string }) => {
        const content = engine.getStepArtifact(params.runId, params.stepId);
        if (!content) {
          return {
            content: [{ type: "text", text: `No artifact found for step "${params.stepId}" in run "${params.runId}".` }],
            details: { success: false },
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: content }],
          details: { success: true, length: content.length },
        };
      },
    },
    {
      name: "list_agents",
      label: "List Agents",
      description: "List all available agents (built-in and custom)",
      parameters: Type.Object({}),
      execute: async () => {
        const agents = engine.listAgents();
        const lines = agents.map((a) =>
          `- ${a.id} (${a.label}) — ${a.category} [${a.source}]`
        );
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { count: agents.length },
        };
      },
    },
    {
      name: "list_skills",
      label: "List Skills",
      description: "List all available skills for agents",
      parameters: Type.Object({}),
      execute: async () => {
        const skills = engine.listSkills();
        const lines = skills.map((s) =>
          `- ${s.id}: ${s.label} — ${s.description}`
        );
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { count: skills.length },
        };
      },
    },
    {
      name: "read_file",
      label: "Read File",
      description: "Read the contents of a file in the workspace",
      parameters: Type.Object({
        path: Type.String({ description: "File path relative to workspace root" }),
      }),
      execute: async (_toolCallId: string, params: { path: string }) => {
        const absPath = path.isAbsolute(params.path) ? params.path : path.join(engine.getConfig().workspace, params.path);
        if (!fs.existsSync(absPath)) {
          return {
            content: [{ type: "text", text: `File not found: ${params.path}` }],
            details: { success: false },
            isError: true,
          };
        }
        const content = fs.readFileSync(absPath, "utf8");
        return {
          content: [{ type: "text", text: content }],
          details: { path: absPath, size: content.length },
        };
      },
    },
    {
      name: "bash",
      label: "Bash",
      description: "Execute a shell command in the workspace",
      parameters: Type.Object({
        command: Type.String({ description: "Command to execute" }),
      }),
      execute: async (_toolCallId: string, params: { command: string }) => {
        const config = engine.getConfig();
        const cmdBinary = params.command.trim().split(/\s+/)[0].replace(/^\.\//, "");
        const allowed = config.allowedCommands;
        const isAllowed = allowed.some((pattern) => {
          if (pattern === cmdBinary) return true;
          if (pattern.includes("*")) {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
            return regex.test(cmdBinary);
          }
          return false;
        });

        if (!isAllowed) {
          return {
            content: [{ type: "text", text: `Command blocked: "${cmdBinary}" is not in the allowed commands list.` }],
            details: { blocked: true, binary: cmdBinary },
            isError: true,
          };
        }

        try {
          const result = execSync(params.command, {
            cwd: config.workspace,
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
            details: { command: params.command, exitCode: error.status || 1 },
            isError: true,
          };
        }
      },
    },
  ];
}
