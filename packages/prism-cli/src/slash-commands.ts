import type { CliEngine, PipelineDetail, RunSummary, RunStateSummary } from "./cli-engine.js";
import type { SlashCommand } from "./types.js";
import * as output from "./output.js";

export function createSlashCommands(engine: CliEngine): SlashCommand[] {
  return [
    {
      name: "help",
      description: "Show all available commands",
      usage: "/help",
      handler: async () => {
        console.log("");
        output.divider();
        console.log(output.colors.bold("  PRISM CLI Commands"));
        output.divider();
        console.log("");

        const commands = createSlashCommands(engine);
        const rows = commands.map((c) => [
          `/${c.name}`,
          c.description,
          c.usage !== `/${c.name}` ? c.usage : "",
        ]);

        output.table(["Command", "Description", "Usage"], rows);
        console.log("");
        console.log(output.colors.dim("  Non-slash input is sent to the AI agent for freeform chat."));
        console.log("");
      },
    },
    {
      name: "pipelines-list",
      description: "List all available pipelines",
      usage: "/pipelines-list",
      handler: async () => {
        const pipelines = engine.listPipelines();
        if (pipelines.length === 0) {
          output.info("No pipelines found. Create one with /pipelines-create");
          return;
        }
        const rows = pipelines.map((p: PipelineDetail) => [
          p.name,
          String(p.stepCount),
          p.displayName,
          p.description.slice(0, 50),
        ]);
        output.table(["Name", "Steps", "Display Name", "Description"], rows);
        console.log("");
      },
    },
    {
      name: "pipelines-create",
      description: "Create a new pipeline from a template",
      usage: "/pipelines-create [template-name]",
      handler: async (args: string[]) => {
        const templates = engine.getTemplateNames();
        const templateArg = args[0];

        let templateName: string;
        if (templateArg && templates.includes(templateArg as any)) {
          templateName = templateArg;
        } else {
          console.log(output.colors.bold("  Available templates:"));
          console.log("");
          for (const t of templates) {
            console.log(`    ${output.colors.primary(t)}`);
          }
          console.log("");
          if (!templateArg) {
            output.info("Usage: /pipelines-create <template-name>");
            return;
          }
          output.error(`Unknown template: ${templateArg}`);
          return;
        }

        const result = engine.createPipelineFromTemplate(templateName);
        if (!result) {
          output.error("Failed to create pipeline");
          return;
        }
        output.success(`Pipeline "${result.name}" created from template "${templateName}"`);
        output.info(`File: .PRISM/pipelines/${result.name}.yaml`);
      },
    },
    {
      name: "pipeline-run",
      description: "Start a pipeline run",
      usage: "/pipeline-run <name> [--idea \"...\"]",
      handler: async (args: string[]) => {
        const pipelineName = args[0];
        if (!pipelineName) {
          output.error("Usage: /pipeline-run <name> [--idea \"...\"]");
          return;
        }

        const ideaIdx = args.indexOf("--idea");
        const idea = ideaIdx >= 0 ? args.slice(ideaIdx + 1).join(" ").replace(/^["']|["']$/g, "") : "";

        const pipelines = engine.listPipelines();
        const pipeline = pipelines.find((p) => p.name === pipelineName || p.displayName === pipelineName);
        if (!pipeline) {
          output.error(`Pipeline "${pipelineName}" not found. Use /pipelines-list to see available pipelines.`);
          return;
        }

        console.log("");
        output.divider();
        console.log(output.colors.bold(`  Starting: ${pipeline.displayName}`));
        if (idea) console.log(output.colors.dim(`  Idea: ${idea}`));
        output.divider();
        console.log("");

        try {
          await engine.runPipeline(pipelineName, { idea, title: pipeline.displayName });
          console.log("");
          output.success("Pipeline run complete");
        } catch (err: any) {
          output.error(`Pipeline failed: ${err?.message ?? err}`);
        }
      },
    },
    {
      name: "pipeline-status",
      description: "Show the status of the most recent run",
      usage: "/pipeline-status",
      handler: async () => {
        const runs = engine.listRuns();
        if (runs.length === 0) {
          output.info("No runs found. Start one with /pipeline-run");
          return;
        }
        const latest = runs[0];
        const state: RunStateSummary | null = engine.loadRun(latest.runId);
        if (!state) {
          output.error("Failed to load run state");
          return;
        }

        console.log("");
        output.divider();
        console.log(output.colors.bold(`  Run: ${state.pipelineName}`));
        console.log(output.colors.dim(`  ID:     ${state.runId}`));
        console.log(output.colors.dim(`  Status: ${state.status}`));
        console.log(output.colors.dim(`  Started: ${state.startedAt}`));
        output.divider();
        console.log("");

        for (const step of state.steps) {
          output.stepStatus(step.id, step.name, step.status, step.revision);
          if (step.error) {
            console.log(output.colors.error(`      ${step.error.slice(0, 100)}`));
          }
        }
        console.log("");
      },
    },
    {
      name: "pipeline-resume",
      description: "Resume the most recent failed or paused run",
      usage: "/pipeline-resume",
      handler: async () => {
        const runs = engine.listRuns();
        if (runs.length === 0) {
          output.error("No runs found to resume");
          return;
        }
        const latest = runs[0];
        if (latest.status === "completed") {
          output.info("Last run is already completed");
          return;
        }

        output.info(`Resuming run: ${latest.pipelineName} (${latest.runId})`);
        const state: RunStateSummary | null = engine.loadRun(latest.runId);
        if (!state) {
          output.error("Failed to load run state");
          return;
        }

        const resumeStep = state.steps.find(
          (s) => s.status === "failed" || s.status === "rejected" || s.status === "in_review"
        );

        try {
          await engine.runPipeline(latest.pipelineName, {
            idea: "",
            title: latest.title,
            resumeFromStep: resumeStep?.id,
          });
          output.success("Pipeline run complete");
        } catch (err: any) {
          output.error(`Pipeline failed: ${err?.message ?? err}`);
        }
      },
    },
    {
      name: "pipeline-dry-run",
      description: "Validate a pipeline without executing it",
      usage: "/pipeline-dry-run <name>",
      handler: async (args: string[]) => {
        const pipelineName = args[0];
        if (!pipelineName) {
          output.error("Usage: /pipeline-dry-run <name>");
          return;
        }

        const result = await engine.dryRun(pipelineName);
        console.log("");
        output.divider();
        console.log(output.colors.bold(`  Dry-Run: ${pipelineName}`));
        output.divider();
        console.log("");

        if (result.errors.length > 0) {
          for (const e of result.errors) {
            output.error(e);
          }
        }
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            console.log(output.colors.warning(`  ⚠ ${w}`));
          }
        }

        if (result.errors.length === 0 && result.warnings.length === 0) {
          output.success("Pipeline is valid");
        }

        const pipelines = engine.listPipelines();
        const pipeline = pipelines.find((p) => p.name === pipelineName);
        if (pipeline) {
          console.log("");
          console.log(output.colors.dim(`  Steps:       ${pipeline.stepCount}`));
          console.log(output.colors.dim(`  Description: ${pipeline.description}`));
        }
        console.log("");
      },
    },
    {
      name: "runs-list",
      description: "List all pipeline runs",
      usage: "/runs-list",
      handler: async () => {
        const runs = engine.listRuns();
        if (runs.length === 0) {
          output.info("No runs found");
          return;
        }
        const rows = runs.map((r: RunSummary) => [
          r.runId.slice(0, 20) + "...",
          r.pipelineName,
          r.status,
          new Date(r.startedAt).toLocaleString(),
        ]);
        output.table(["Run ID", "Pipeline", "Status", "Started"], rows);
        console.log("");
      },
    },
    {
      name: "runs-view",
      description: "View details of a specific run",
      usage: "/runs-view <run-id>",
      handler: async (args: string[]) => {
        const runId = args[0];
        if (!runId) {
          output.error("Usage: /runs-view <run-id>");
          return;
        }

        const state = engine.loadRun(runId);
        if (!state) {
          output.error(`Run "${runId}" not found. Use /runs-list to see available runs.`);
          return;
        }

        console.log("");
        output.divider();
        console.log(output.colors.bold(`  Run: ${state.pipelineName}`));
        console.log(output.colors.dim(`  ID:     ${state.runId}`));
        console.log(output.colors.dim(`  Status: ${state.status}`));
        output.divider();
        console.log("");

        for (const step of state.steps) {
          output.stepStatus(step.id, step.name, step.status, step.revision);
          if (step.error) {
            console.log(output.colors.error(`      ${step.error.slice(0, 100)}`));
          }
        }

        console.log("");
        console.log(output.colors.bold("  Decisions:"));
        for (const d of state.decisions.slice(-10)) {
          const decision = d as { type: string; summary: string; stepId?: string };
          const stepLabel = decision.stepId ? ` [${decision.stepId}]` : "";
          console.log(output.colors.dim(`    ${decision.type}${stepLabel}: ${decision.summary.slice(0, 80)}`));
        }
        console.log("");
      },
    },
    {
      name: "runs-artifact",
      description: "View the artifact output of a step",
      usage: "/runs-artifact <run-id> <step-id>",
      handler: async (args: string[]) => {
        const [runId, stepId] = args;
        if (!runId || !stepId) {
          output.error("Usage: /runs-artifact <run-id> <step-id>");
          return;
        }

        const content = engine.getStepArtifact(runId, stepId);
        if (!content) {
          output.error(`No artifact found for step "${stepId}" in run "${runId}"`);
          return;
        }

        console.log("");
        output.divider();
        console.log(output.colors.bold(`  Artifact: ${stepId}`));
        output.divider();
        console.log("");
        console.log(content);
        console.log("");
      },
    },
    {
      name: "agents-list",
      description: "List available agents",
      usage: "/agents-list",
      handler: async () => {
        const agents = engine.listAgents();
        const rows = agents.map((a: { id: string; label: string; category: string; source: string }) => [
          a.id,
          a.label,
          a.category,
          a.source,
        ]);
        output.table(["ID", "Label", "Category", "Source"], rows);
        console.log("");
      },
    },
    {
      name: "skills-list",
      description: "List available skills",
      usage: "/skills-list",
      handler: async () => {
        const skills = engine.listSkills();
        const rows = skills.map((s: { id: string; label: string; description: string }) => [
          s.id,
          s.label,
          s.description.slice(0, 60),
        ]);
        output.table(["ID", "Label", "Description"], rows);
        console.log("");
      },
    },
    {
      name: "settings",
      description: "Show current configuration",
      usage: "/settings",
      handler: async () => {
        const config = engine.getConfig();
        console.log("");
        output.divider();
        console.log(output.colors.bold("  PRISM CLI Configuration"));
        output.divider();
        console.log("");
        console.log(`  Workspace:     ${output.colors.primary(config.workspace)}`);
        console.log(`  Backend:       ${config.backend}`);
        console.log(`  Provider:      ${config.provider}`);
        console.log(`  Model:         ${config.model}`);
        console.log(`  API Key:       ${config.apiKey ? "set (" + config.apiKey.length + " chars)" : "not set"}`);
        console.log(`  Pi API Key:    ${config.piApiKey ? "set (" + config.piApiKey.length + " chars)" : "not set"}`);
        console.log(`  Allowed Cmds:  ${config.allowedCommands.length} commands`);
        console.log("");
      },
    },
    {
      name: "backend",
      description: "Switch AI backend",
      usage: "/backend <cursor|pi|anthropic>",
      handler: async (args: string[]) => {
        const backend = args[0];
        if (!backend || !["cursor", "pi", "anthropic"].includes(backend)) {
          output.error("Usage: /backend <cursor|pi|anthropic>");
          return;
        }
        engine.updateConfig({ backend: backend as "cursor" | "pi" | "anthropic" });
        output.success(`Backend switched to ${backend}`);
      },
    },
    {
      name: "model",
      description: "Switch AI model",
      usage: "/model <model-id>",
      handler: async (args: string[]) => {
        const model = args.join(" ");
        if (!model) {
          output.error("Usage: /model <model-id>");
          return;
        }
        engine.updateConfig({ model });
        output.success(`Model switched to ${model}`);
      },
    },
    {
      name: "exit",
      description: "Exit the CLI",
      usage: "/exit",
      handler: async () => {
        process.exit(0);
      },
    },
  ];
}

export function parseSlashCommand(input: string): { name: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  return {
    name: parts[0],
    args: parts.slice(1),
  };
}

export function findCommand(commands: SlashCommand[], name: string): SlashCommand | undefined {
  return commands.find((c) => c.name === name);
}
