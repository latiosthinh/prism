import { PipelineDefinition } from "./schema.js";

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
  stepId?: string;
}

const BUILTIN_AGENT_IDS = new Set<string>([
  "idea-expander",
  "requirements-engineer",
  "architect",
  "task-generator",
  "executor",
  "critic",
  "test-writer",
  "reporter",
  "security-reviewer",
  "performance-reviewer",
  "docs-writer",
  "migration-planner",
]);

export class PipelineValidator {
  validate(pipeline: PipelineDefinition): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const stepIds = new Set(pipeline.steps.map((s) => s.id));
    const customAgentIds = new Set(pipeline.agents.map((a) => a.id));

    for (const step of pipeline.steps) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          issues.push({
            type: "error",
            message: `Step '${step.id}' depends on unknown step '${dep}'`,
            stepId: step.id,
          });
        }
      }

      if (!customAgentIds.has(step.agent) && !BUILTIN_AGENT_IDS.has(step.agent)) {
        issues.push({
          type: "warning",
          message: `Step '${step.id}' references unknown agent '${step.agent}' (not built-in or in pipeline.agents)`,
          stepId: step.id,
        });
      }
    }

    const cycle = this.findCycle(pipeline);
    if (cycle) {
      issues.push({
        type: "error",
        message: `Dependency cycle detected: ${cycle.join(" → ")}`,
      });
    }

    return issues;
  }

  topologicalSort(pipeline: PipelineDefinition): string[] {
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    for (const step of pipeline.steps) {
      adj[step.id] = step.depends_on.slice();
      inDegree[step.id] = 0;
    }
    for (const step of pipeline.steps) {
      for (const dep of step.depends_on) {
        if (inDegree[step.id] !== undefined) inDegree[step.id]++;
      }
    }

    const queue: string[] = [];
    for (const id of Object.keys(inDegree)) {
      if (inDegree[id] === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const step of pipeline.steps) {
        if (step.depends_on.includes(id)) {
          inDegree[step.id]--;
          if (inDegree[step.id] === 0) queue.push(step.id);
        }
      }
    }

    if (result.length !== pipeline.steps.length) {
      throw new Error(
        "Cannot topologically sort: pipeline contains a dependency cycle",
      );
    }
    return result;
  }

  findCycle(pipeline: PipelineDefinition): string[] | null {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const parent: Record<string, string | null> = {};
    const adj: Record<string, string[]> = {};

    for (const step of pipeline.steps) {
      adj[step.id] = step.depends_on.slice();
    }

    const reconstruct = (start: string, end: string): string[] => {
      const path: string[] = [end];
      let cur: string | null = start;
      while (cur && cur !== end) {
        path.push(cur);
        cur = parent[cur] ?? null;
      }
      path.push(end);
      return path.reverse();
    };

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      inStack.add(node);

      const neighbors = adj[node] ?? [];
      for (const next of neighbors) {
        if (!visited.has(next)) {
          parent[next] = node;
          const found = dfs(next);
          if (found) return found;
        } else if (inStack.has(next)) {
          return reconstruct(node, next);
        }
      }

      inStack.delete(node);
      return null;
    };

    for (const step of pipeline.steps) {
      if (!visited.has(step.id)) {
        parent[step.id] = null;
        const found = dfs(step.id);
        if (found) return found;
      }
    }

    return null;
  }

  findParallelGroups(pipeline: PipelineDefinition): string[][] {
    const order = this.topologicalSort(pipeline);
    const stepMap = new Map(pipeline.steps.map((s) => [s.id, s]));
    const processed = new Set<string>();
    const groups: string[][] = [];
    let current: string[] = [];

    for (const id of order) {
      const step = stepMap.get(id);
      if (!step) continue;
      const hasUnprocessedDep = step.depends_on.some(
        (d) => !processed.has(d) && stepMap.has(d),
      );
      if (hasUnprocessedDep) {
        if (current.length > 0) groups.push(current);
        current = [id];
      } else {
        current.push(id);
      }
      processed.add(id);
    }

    if (current.length > 0) groups.push(current);
    return groups;
  }
}
