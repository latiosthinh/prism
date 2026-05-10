import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  PipelineDefinition,
  PipelineRunState,
  Decision,
  AgentEvent,
  RUNS_DIR,
} from "../pipeline/schema.js";
import { StateMachine } from "../orchestrator/state-machine.js";

export class CascadeRejector {
  private readonly machine: StateMachine;

  constructor() {
    this.machine = new StateMachine();
  }

  cascadeReject(
    run: PipelineRunState,
    fromStepId: string,
    targetStepId: string,
    reason: string,
    pipeline: PipelineDefinition,
  ): void {
    const order = pipeline.steps.map((s) => s.id);
    const fromIdx = order.indexOf(fromStepId);
    const targetIdx = order.indexOf(targetStepId);
    if (fromIdx < 0 || targetIdx < 0) return;

    const lo = Math.min(fromIdx, targetIdx);
    const hi = Math.max(fromIdx, targetIdx);

    for (let i = lo; i <= hi; i++) {
      const sid = order[i];
      const state = run.steps[sid];
      if (!state) continue;
      const wasRunning = state.status === "running";
      this.machine.transitionStep(run, sid, "rejected");
      if (!wasRunning) state.revision++;
    }

    const decision: Decision = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: "step_rejected",
      summary: `Cascade reject from ${fromStepId} → ${targetStepId}: ${reason}`,
      detail: reason,
      stepId: targetStepId,
    };
    this.machine.addDecision(run, decision);
  }

  canCascade(
    run: PipelineRunState,
    fromStepId: string,
    targetStepId: string,
    pipeline: PipelineDefinition,
  ): boolean {
    const order = pipeline.steps.map((s) => s.id);
    const fromIdx = order.indexOf(fromStepId);
    const targetIdx = order.indexOf(targetStepId);
    if (fromIdx < 0 || targetIdx < 0) return false;
    return targetIdx < fromIdx;
  }

  findRollbackTarget(
    failedStepId: string,
    pipeline: PipelineDefinition,
  ): string {
    const stepIds = pipeline.steps.map((s) => s.id);
    const failedIdx = stepIds.indexOf(failedStepId);
    if (failedIdx < 0) return failedStepId;

    const depGraph = this.buildDepGraph(pipeline);

    const consumers: string[] = [];
    for (const [sid, deps] of depGraph) {
      if (deps.includes(failedStepId)) consumers.push(sid);
    }

    if (consumers.length === 0) {
      return stepIds[Math.max(0, failedIdx - 1)];
    }

    // BFS upstream from each consumer
    const upstream = new Set<string>();
    const queue = [...consumers];
    while (queue.length) {
      const current = queue.shift()!;
      const deps = depGraph.get(current) ?? [];
      for (const d of deps) {
        if (upstream.has(d)) continue;
        upstream.add(d);
        queue.push(d);
      }
    }

    let best = -1;
    let bestId = stepIds[Math.max(0, failedIdx - 1)];
    for (const cand of upstream) {
      const idx = stepIds.indexOf(cand);
      if (idx >= 0 && idx < failedIdx && idx > best) {
        best = idx;
        bestId = cand;
      }
    }

    return bestId;
  }

  private buildDepGraph(
    pipeline: PipelineDefinition,
  ): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const step of pipeline.steps) {
      map.set(step.id, step.depends_on.slice());
    }
    return map;
  }
}

export class RunStore {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  getRunDir(runId: string): string {
    return path.join(this.workspaceRoot, RUNS_DIR, runId);
  }

  ensureRunDir(runId: string): void {
    const runDir = this.getRunDir(runId);
    if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
    const stepsDir = path.join(runDir, "steps");
    if (!fs.existsSync(stepsDir)) fs.mkdirSync(stepsDir, { recursive: true });
  }

  saveState(run: PipelineRunState): void {
    this.ensureRunDir(run.runId);
    const file = path.join(this.getRunDir(run.runId), "state.json");
    fs.writeFileSync(file, JSON.stringify(run, null, 2), "utf8");
  }

  loadState(runId: string): PipelineRunState | null {
    const file = path.join(this.getRunDir(runId), "state.json");
    try {
      if (!fs.existsSync(file)) return null;
      const raw = fs.readFileSync(file, "utf8");
      return JSON.parse(raw) as PipelineRunState;
    } catch {
      return null;
    }
  }

  archiveArtifact(
    runId: string,
    stepId: string,
    revision: number,
    content: string,
  ): void {
    this.ensureRunDir(runId);
    const archiveDir = path.join(
      this.getRunDir(runId),
      "steps",
      stepId,
      "archive",
    );
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(archiveDir, `rev-${revision}.md`),
      content,
      "utf8",
    );
    const stepDir = path.join(this.getRunDir(runId), "steps", stepId);
    fs.writeFileSync(path.join(stepDir, "latest.md"), content, "utf8");
  }

  loadArtifact(
    runId: string,
    stepId: string,
    revision?: number,
  ): string | null {
    const stepDir = path.join(this.getRunDir(runId), "steps", stepId);
    const file =
      typeof revision === "number"
        ? path.join(stepDir, "archive", `rev-${revision}.md`)
        : path.join(stepDir, "latest.md");
    try {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }

  listArchives(runId: string, stepId: string): number[] {
    const archiveDir = path.join(
      this.getRunDir(runId),
      "steps",
      stepId,
      "archive",
    );
    try {
      if (!fs.existsSync(archiveDir)) return [];
      return fs
        .readdirSync(archiveDir)
        .map((f) => f.match(/^rev-(\d+)\.md$/)?.[1])
        .filter((s): s is string => Boolean(s))
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => b - a);
    } catch {
      return [];
    }
  }

  listRuns(): string[] {
    const dir = path.join(this.workspaceRoot, RUNS_DIR);
    try {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .filter((d) =>
          fs.existsSync(path.join(dir, d.name, "state.json")),
        )
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  appendEvent(runId: string, event: AgentEvent): void {
    try {
      this.ensureRunDir(runId);
      const file = path.join(this.getRunDir(runId), "events.jsonl");
      fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
    } catch {
      /* best-effort logging */
    }
  }

  savePrompt(
    runId: string,
    stepId: string,
    revision: number,
    content: string,
    metadata?: Record<string, unknown>,
  ): void {
    try {
      this.ensureRunDir(runId);
      const stepDir = path.join(this.getRunDir(runId), "steps", stepId);
      if (!fs.existsSync(stepDir)) fs.mkdirSync(stepDir, { recursive: true });
      const archiveDir = path.join(stepDir, "prompt-archive");
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      const header = metadata
        ? `<!-- ${JSON.stringify(metadata)} -->\n\n`
        : "";
      const body = header + content;
      fs.writeFileSync(path.join(stepDir, "prompt.md"), body, "utf8");
      fs.writeFileSync(
        path.join(archiveDir, `rev-${revision}.md`),
        body,
        "utf8",
      );
    } catch {
      /* best-effort */
    }
  }

  loadPrompt(runId: string, stepId: string): string | null {
    const file = path.join(this.getRunDir(runId), "steps", stepId, "prompt.md");
    try {
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }

  loadEvents(runId: string): AgentEvent[] {
    const file = path.join(this.getRunDir(runId), "events.jsonl");
    try {
      if (!fs.existsSync(file)) return [];
      const raw = fs.readFileSync(file, "utf8");
      const out: AgentEvent[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          out.push(JSON.parse(trimmed));
        } catch {
          /* skip malformed line */
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}
