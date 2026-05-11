#!/usr/bin/env node

import { Command } from "commander";
import * as readline from "readline";
import { loadConfig } from "./config.js";
import { PRISMCliAgent } from "./cli-agent.js";
import { CliEngine } from "./cli-engine.js";
import { createSlashCommands, parseSlashCommand, findCommand } from "./slash-commands.js";
import * as output from "./output.js";

const program = new Command();

program
  .name("prism")
  .description("PRISM CLI — Interactive pipeline agent")
  .version("0.2.0")
  .option("-w, --workspace <path>", "Workspace directory", process.cwd())
  .option("-b, --backend <backend>", "AI backend (cursor|pi|anthropic)")
  .option("-p, --provider <provider>", "AI provider (anthropic|openai|google|...)")
  .option("-m, --model <model>", "AI model name")
  .option("-k, --api-key <key>", "API key for the provider")
  .option("--pi-api-key <key>", "API key for Pi SDK provider")
  .option("--idea <idea>", "Idea to seed the first pipeline run")
  .option("--run <pipeline>", "Run a specific pipeline and exit")
  .option("--dry-run <pipeline>", "Validate a pipeline without executing")
  .option("--list-pipelines", "List all pipelines and exit")
  .option("--list-runs", "List all runs and exit")
  .option("--status", "Show the status of the most recent run")
  .parse(process.argv);

const opts = program.opts();

async function main(): Promise<void> {
  const config = loadConfig({
    workspace: opts.workspace,
    backend: opts.backend,
    provider: opts.provider,
    model: opts.model,
    apiKey: opts.apiKey,
    piApiKey: opts.piApiKey,
  });

  // Handle one-shot commands
  if (opts.listPipelines) {
    const engine = new CliEngine(config);
    engine.ensureSkeleton();
    const pipelines = engine.listPipelines();
    const rows = pipelines.map((p) => [p.name, String(p.stepCount), p.displayName]);
    output.table(["Name", "Steps", "Description"], rows);
    return;
  }

  if (opts.listRuns) {
    const engine = new CliEngine(config);
    engine.ensureSkeleton();
    const runs = engine.listRuns();
    if (runs.length === 0) {
      output.info("No runs found");
      return;
    }
    const rows = runs.map((r) => [r.runId.slice(0, 20) + "...", r.pipelineName, r.status]);
    output.table(["Run ID", "Pipeline", "Status"], rows);
    return;
  }

  if (opts.status) {
    const engine = new CliEngine(config);
    engine.ensureSkeleton();
    const runs = engine.listRuns();
    if (runs.length === 0) {
      output.info("No runs found");
      return;
    }
    const state = engine.loadRun(runs[0].runId);
    if (!state) return;
    console.log(output.colors.bold(`Run: ${state.pipelineName} (${state.status})`));
    for (const step of state.steps) {
      output.stepStatus(step.id, step.name, step.status);
    }
    return;
  }

  if (opts.dryRun) {
    const engine = new CliEngine(config);
    engine.ensureSkeleton();
    const result = await engine.dryRun(opts.dryRun);
    if (result.errors.length > 0) {
      for (const e of result.errors) output.error(e);
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.log(output.colors.warning(`  ⚠ ${w}`));
    }
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.success("Pipeline is valid");
    }
    return;
  }

  if (opts.run) {
    const engine = new CliEngine(config);
    engine.ensureSkeleton();
    try {
      await engine.runPipeline(opts.run, { idea: opts.idea || "" });
      output.success("Pipeline complete");
    } catch (err: any) {
      output.error(`Pipeline failed: ${err?.message ?? err}`);
      process.exitCode = 1;
    }
    return;
  }

  // Interactive REPL
  const agent = new PRISMCliAgent(config);
  const engine = agent.getEngine();
  const commands = createSlashCommands(engine);

  output.banner();
  output.statusLine({
    backend: config.backend,
    model: config.model,
    workspace: config.workspace,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptText = output.colors.primary("> ") + "";

  function ask(): void {
    rl.question(promptText, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        ask();
        return;
      }

      const parsed = parseSlashCommand(trimmed);
      if (parsed) {
        const cmd = findCommand(commands, parsed.name);
        if (cmd) {
          try {
            await cmd.handler(parsed.args);
          } catch (err: any) {
            output.error(err?.message ?? String(err));
          }
        } else {
          output.error(`Unknown command: /${parsed.name}. Type /help for available commands.`);
        }
        ask();
        return;
      }

      // Send to AI agent
      try {
        let lineBuffer = "";
        const result = await agent.chat(trimmed, (event) => {
          if (event.type === "tool") {
            console.log(output.colors.dim(`  ${event.content}`));
          } else if (event.type === "text") {
            lineBuffer += event.content;
            if (event.content.includes("\n") || lineBuffer.length > 120) {
              process.stdout.write(lineBuffer);
              lineBuffer = "";
            }
          }
        });

        if (lineBuffer) {
          process.stdout.write(lineBuffer + "\n");
        }
        console.log("");
      } catch (err: any) {
        output.error(err?.message ?? String(err));
      }

      ask();
    });
  }

  ask();
}

main().catch((err) => {
  console.error("PRISM CLI error:", err.message);
  process.exit(1);
});
