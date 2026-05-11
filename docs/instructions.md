# PRISM — Implementation Instructions

Three areas, ordered by when to do them: Quick Wins first (unblock trust), then Engine Depth (make it powerful), then High Leverage (make it a platform).

---

## Part 1 — Quick Wins

_One afternoon each. Ship before anything else._

---

### 1.1 SecretStorage migration

**Why first:** API keys in `settings.json` sync to Microsoft's cloud via VS Code Settings Sync. Real financial risk for users.

**Files to touch:**

- `prism/src/extension/extension.ts` — pass `context` down to engine-bridge
- `prism/src/extension/engine-bridge.ts` — replace `getConfiguration` calls with `SecretStorage`
- `prism/package.json` — remove `piApiKey`, `apiKey` from `contributes.configuration`

**Step 1 — Add a secrets helper**

Create `prism/src/extension/secrets.ts`:

```typescript
import * as vscode from "vscode";

const KEYS = [
	"prism.piApiKey",
	"prism.apiKey",
	"prism.anthropicApiKey",
] as const;

type SecretKey = (typeof KEYS)[number];

export class PrismSecrets {
	constructor(private secrets: vscode.SecretStorage) {}

	async get(key: SecretKey): Promise<string | undefined> {
		return this.secrets.get(key);
	}

	async set(key: SecretKey, value: string): Promise<void> {
		return this.secrets.store(key, value);
	}

	async delete(key: SecretKey): Promise<void> {
		return this.secrets.delete(key);
	}

	/** One-time migration: move plaintext settings into SecretStorage */
	async migrateLegacy(): Promise<void> {
		const config = vscode.workspace.getConfiguration("prism");
		for (const key of KEYS) {
			const shortKey = key.replace("prism.", "") as string;
			const legacy = config.get<string>(shortKey);
			if (legacy && legacy.trim().length > 0) {
				await this.secrets.store(key, legacy);
				await config.update(
					shortKey,
					undefined,
					vscode.ConfigurationTarget.Global,
				);
			}
		}
	}
}
```

**Step 2 — Wire into `extension.ts`**

```typescript
import { PrismSecrets } from "./secrets";

export async function activate(context: vscode.ExtensionContext) {
	const prismSecrets = new PrismSecrets(context.secrets);
	await prismSecrets.migrateLegacy(); // runs once, cleans up old keys

	const bridge = new EngineBridge(prismSecrets);
	// ... rest of activation
}
```

**Step 3 — Update `engine-bridge.ts`**

```typescript
// Before
private getApiKey(): string {
  return vscode.workspace.getConfiguration('prism').get('piApiKey') ?? '';
}

// After
private async getApiKey(): Promise<string> {
  const key = await this.secrets.get('prism.piApiKey');
  if (!key) throw new Error('No API key set. Run PRISM: Set API Key to configure.');
  return key;
}
```

**Step 4 — Add a "Set API Key" command**

Register in `package.json` under `contributes.commands`:

```json
{
	"command": "prism.setApiKey",
	"title": "PRISM: Set API Key"
}
```

Handler in `extension.ts`:

```typescript
vscode.commands.registerCommand("prism.setApiKey", async () => {
	const key = await vscode.window.showInputBox({
		prompt: "Enter your API key",
		password: true, // masks input
		ignoreFocusOut: true,
	});
	if (key) {
		await prismSecrets.set("prism.piApiKey", key.trim());
		vscode.window.showInformationMessage("PRISM: API key saved securely.");
	}
});
```

**Step 5 — Remove keys from `contributes.configuration`**

In `prism/package.json`, delete the `piApiKey` and `apiKey` properties from the configuration schema entirely. Replace with a note in the description of the remaining settings pointing to the `Set API Key` command.

**Verification:** After installing the updated extension, open the VS Code Keychain (macOS: Keychain Access → search "vscode") and confirm the key appears there, not in `~/.config/Code/User/settings.json`.

---

### 1.2 Real CI badge

**Why:** The hardcoded `build: passing` badge is visibly fake to any developer who inspects it. One workflow file fixes this permanently.

**Files to create:**

- `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build SDK
        run: npm run build --workspace=@prism/sdk

      - name: Build CLI
        run: npm run build --workspace=@prism/cli

      - name: Build extension
        run: npm run build --workspace=prism

      - name: Run tests
        run: npm test --workspaces --if-present

      - name: Package extension
        run: npx vsce package --no-dependencies
        working-directory: ./prism
```

**Update README badge:**

```markdown
[![CI](https://github.com/latiosthinh/prism/actions/workflows/ci.yml/badge.svg)](https://github.com/latiosthinh/prism/actions/workflows/ci.yml)
```

**Note on the `vsce package` step:** This will fail until `prism/package.json` has a valid `publisher` field and the `vsce` package is in `devDependencies`. Add both:

```bash
npm install --save-dev @vscode/vsce --workspace=prism
```

And in `prism/package.json`:

```json
{
	"publisher": "latiosthinh",
	"repository": {
		"type": "git",
		"url": "https://github.com/latiosthinh/prism"
	}
}
```

---

### 1.3 VSIX release artifact

Once CI is passing, add a release job that publishes a `.vsix` file to GitHub Releases on every version tag:

```yaml
release:
  needs: build-and-test
  if: startsWith(github.ref, 'refs/tags/v')
  runs-on: ubuntu-latest

  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: "npm"

    - run: npm ci
    - run: npm run build

    - name: Package extension
      run: npx vsce package --no-dependencies -o prism.vsix
      working-directory: ./prism

    - name: Create GitHub Release
      uses: softprops/action-gh-release@v2
      with:
        files: prism/prism.vsix
        generate_release_notes: true
```

Tag a release with `git tag v0.2.0 && git push --tags` and the `.vsix` appears on the Releases page automatically. Users can then install it with:

```bash
code --install-extension prism.vsix
```

---

## Part 2 — Engine Depth

_Make the pipeline engine genuinely powerful. Do after Quick Wins._

---

### 2.1 Parallel step execution

Steps with no dependency relationship currently run sequentially. This change makes them run concurrently.

**File:** `prism/src/engine/orchestrator/orchestrator.ts`

The key insight is that the orchestrator already resolves `depends_on` — it just doesn't use that information to parallelize. The change is in the execution loop:

```typescript
// Current pattern (sequential)
for (const step of steps) {
  await this.runStep(step);
}

// New pattern (parallel where possible)
async runPipeline(steps: PipelineStep[]): Promise<void> {
  const completed = new Set<string>();
  const running = new Map<string, Promise<void>>();

  const isReady = (step: PipelineStep): boolean => {
    if (running.has(step.id)) return false;
    if (completed.has(step.id)) return false;
    return (step.depends_on ?? []).every(dep => completed.has(dep));
  };

  while (completed.size < steps.length) {
    // Find all steps that are ready to run now
    const ready = steps.filter(isReady);

    if (ready.length === 0 && running.size === 0) {
      throw new Error('Pipeline deadlock: unresolvable dependencies');
    }

    // Launch all ready steps concurrently
    for (const step of ready) {
      const promise = this.runStep(step).then(() => {
        completed.add(step.id);
        running.delete(step.id);
      });
      running.set(step.id, promise);
    }

    // Wait for any one step to finish, then re-evaluate
    await Promise.race(running.values());
  }
}
```

**YAML stays unchanged** — `depends_on` is already in the schema. Steps without `depends_on` automatically run in parallel with anything else that's ready. No user-facing migration needed.

**Gate handling:** Gates (`gate: true`) must block the entire pipeline, not just their branch. Add a check before launching ready steps:

```typescript
// Don't launch new steps if any running step has a pending gate
const pendingGate = steps.find((s) => s.gate && running.has(s.id));
if (pendingGate) {
	await running.get(pendingGate.id);
	continue;
}
```

---

### 2.2 Conditional branching

Add `if:` and `condition:` as first-class YAML fields so steps can be skipped based on runtime state.

**Step 1 — Extend the pipeline schema**

In `prism/src/engine/pipeline/schema.ts`:

```typescript
export interface PipelineStep {
	id: string;
	agent: string;
	backend?: string;
	depends_on?: string[];
	gate?: boolean;
	condition?: string; // e.g. "gate_approved" | "gate_rejected"
	if?: string; // expression evaluated at runtime
	// ... existing fields
}
```

**Step 2 — Condition evaluator**

Create `prism/src/engine/pipeline/conditions.ts`:

```typescript
export type RunState = {
	gateDecisions: Record<string, "approved" | "rejected">;
	stepOutputs: Record<string, string>;
	variables: Record<string, string>;
};

export function evaluateCondition(expr: string, state: RunState): boolean {
	// Built-in conditions
	if (expr === "gate_approved") {
		// True if the most recent gate was approved
		const decisions = Object.values(state.gateDecisions);
		return decisions[decisions.length - 1] === "approved";
	}
	if (expr === "gate_rejected") {
		const decisions = Object.values(state.gateDecisions);
		return decisions[decisions.length - 1] === "rejected";
	}
	// Step-specific gate: "gate:review_approved"
	const gateMatch = expr.match(/^gate:(\w+)_(approved|rejected)$/);
	if (gateMatch) {
		const [, stepId, outcome] = gateMatch;
		return state.gateDecisions[stepId] === outcome;
	}
	// Variable check: "var:HAS_TESTS=true"
	const varMatch = expr.match(/^var:(\w+)=(.+)$/);
	if (varMatch) {
		const [, key, expected] = varMatch;
		return state.variables[key] === expected;
	}
	return true; // unknown conditions pass through
}
```

**Step 3 — Use in orchestrator**

```typescript
if (step.condition && !evaluateCondition(step.condition, this.state)) {
	this.emitSkipped(step.id, step.condition);
	completed.add(step.id);
	continue;
}
```

**YAML example — the result:**

```yaml
steps:
  - id: review
    agent: critic
    gate: true

  - id: test
    agent: test-writer
    depends_on: [review]
    condition: "gate:review_approved" # only runs if reviewer approved

  - id: hotfix
    agent: executor
    depends_on: [review]
    condition: "gate:review_rejected" # only runs if reviewer rejected
```

---

### 2.3 Per-step retry with backoff

LLM API calls fail transiently — rate limits, timeouts, provider hiccups. Currently a single failure aborts the run. Retry logic makes runs resilient.

**Extend the schema:**

```typescript
export interface PipelineStep {
	// ... existing
	retry?: {
		attempts: number; // default: 1 (no retry)
		backoff_ms?: number; // initial delay, doubles each attempt. default: 2000
		on?: ("timeout" | "rate_limit" | "any")[];
	};
}
```

**YAML:**

```yaml
- id: implement
  agent: executor
  retry:
    attempts: 3
    backoff_ms: 2000
    on: [rate_limit, timeout]
```

**Implementation in step runner:**

```typescript
async function runWithRetry<T>(
	fn: () => Promise<T>,
	opts: { attempts: number; backoff_ms: number },
): Promise<T> {
	let lastError: Error;
	for (let attempt = 0; attempt < opts.attempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err as Error;
			if (attempt < opts.attempts - 1) {
				const delay = opts.backoff_ms * Math.pow(2, attempt);
				await new Promise((res) => setTimeout(res, delay));
			}
		}
	}
	throw lastError!;
}
```

---

### 2.4 Agent output schema validation

Agents currently pass their raw text output downstream. If an agent produces malformed output, the next agent silently gets bad input. Validation catches this at the boundary.

**Add to each agent definition:**

```typescript
export interface AgentDefinition {
	id: string;
	systemPrompt: string;
	outputSchema?: {
		required: string[]; // sections that must appear in output
		format: "markdown" | "json" | "code";
		minLength?: number;
	};
}
```

**Validator:**

```typescript
export function validateAgentOutput(
	output: string,
	schema: AgentDefinition["outputSchema"],
): { valid: boolean; errors: string[] } {
	if (!schema) return { valid: true, errors: [] };
	const errors: string[] = [];

	if (schema.minLength && output.length < schema.minLength) {
		errors.push(
			`Output too short: ${output.length} < ${schema.minLength} chars`,
		);
	}
	for (const section of schema.required ?? []) {
		if (!output.toLowerCase().includes(section.toLowerCase())) {
			errors.push(`Missing required section: "${section}"`);
		}
	}
	if (schema.format === "json") {
		try {
			JSON.parse(output);
		} catch {
			errors.push("Output is not valid JSON");
		}
	}
	return { valid: errors.length === 0, errors };
}
```

**Example — architect agent definition:**

```typescript
{
  id: 'architect',
  outputSchema: {
    format: 'markdown',
    minLength: 500,
    required: ['## Components', '## Data Flow', '## API'],
  }
}
```

If validation fails, the orchestrator can retry the step with an augmented prompt: `"Your previous output was missing the ## Components section. Please include it."` — this is far better than silently failing downstream.

---

### 2.5 Pipeline dry-run mode

Validates YAML schema, resolves dependency graph, checks for cycles and missing agent IDs — without calling any AI provider.

**Add CLI flag and command:**

```typescript
// In @prism/cli
prism run my-pipeline.yaml --dry-run

// In VS Code command palette
PRISM: Validate Pipeline
```

**Implementation:**

```typescript
export function dryRun(pipeline: Pipeline): DryRunResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	// 1. Validate all agent IDs exist
	for (const step of pipeline.steps) {
		if (!BUILT_IN_AGENTS.includes(step.agent)) {
			errors.push(`Unknown agent: "${step.agent}" in step "${step.id}"`);
		}
	}

	// 2. Validate dependency graph (no unknown refs)
	const stepIds = new Set(pipeline.steps.map((s) => s.id));
	for (const step of pipeline.steps) {
		for (const dep of step.depends_on ?? []) {
			if (!stepIds.has(dep)) {
				errors.push(`Step "${step.id}" depends on unknown step "${dep}"`);
			}
		}
	}

	// 3. Detect cycles using DFS
	const cycles = detectCycles(pipeline.steps);
	errors.push(...cycles.map((c) => `Dependency cycle: ${c.join(" → ")}`));

	// 4. Warn on no-gate long pipelines
	const gateCount = pipeline.steps.filter((s) => s.gate).length;
	if (pipeline.steps.length > 4 && gateCount === 0) {
		warnings.push("No gates defined — pipeline will run fully automated");
	}

	return { valid: errors.length === 0, errors, warnings };
}
```

---

## Part 3 — High Leverage

_These two features expand PRISM's scope from "VS Code tool" to "developer platform"._

---

### 3.1 MCP tool integration

MCP (Model Context Protocol) lets agents call external tools — databases, APIs, internal services — through a standardized interface. Adding MCP support means any MCP server can become a tool in any PRISM pipeline step without writing a custom runner.

**Extend the step schema:**

```yaml
steps:
  - id: implement
    agent: executor
    mcp_servers:
      - name: filesystem
        command: npx
        args: [-y, "@modelcontextprotocol/server-filesystem", "./src"]
      - name: github
        command: npx
        args: [-y, "@modelcontextprotocol/server-github"]
        env:
          GITHUB_TOKEN: "${env:GITHUB_TOKEN}"
```

**Step 1 — Add MCP client to `@prism/sdk`**

Install the MCP SDK:

```bash
npm install @modelcontextprotocol/sdk --workspace=@prism/sdk
```

Create `packages/prism-sdk/src/mcp-client.ts`:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

export class McpClientManager {
	private clients = new Map<string, Client>();

	async connect(config: McpServerConfig): Promise<Client> {
		const transport = new StdioClientTransport({
			command: config.command,
			args: config.args ?? [],
			env: { ...process.env, ...(config.env ?? {}) },
		});
		const client = new Client({ name: "prism", version: "0.2.0" }, {});
		await client.connect(transport);
		this.clients.set(config.name, client);
		return client;
	}

	async listTools(serverName: string) {
		const client = this.clients.get(serverName);
		if (!client) throw new Error(`MCP server "${serverName}" not connected`);
		const { tools } = await client.listTools();
		return tools;
	}

	async callTool(serverName: string, toolName: string, args: unknown) {
		const client = this.clients.get(serverName);
		if (!client) throw new Error(`MCP server "${serverName}" not connected`);
		return client.callTool({
			name: toolName,
			arguments: args as Record<string, unknown>,
		});
	}

	async disconnectAll() {
		for (const client of this.clients.values()) {
			await client.close();
		}
		this.clients.clear();
	}
}
```

**Step 2 — Inject MCP tools into agent context**

In `pi-sdk-runner.ts` (or the relevant step runner), before calling the LLM:

```typescript
async function buildToolsForStep(
	step: PipelineStep,
	mcpManager: McpClientManager,
): Promise<Tool[]> {
	const tools: Tool[] = [...BUILT_IN_TOOLS]; // existing fs/shell tools

	for (const serverConfig of step.mcp_servers ?? []) {
		await mcpManager.connect(serverConfig);
		const mcpTools = await mcpManager.listTools(serverConfig.name);

		for (const mcpTool of mcpTools) {
			tools.push({
				name: `${serverConfig.name}__${mcpTool.name}`,
				description: mcpTool.description ?? "",
				input_schema: mcpTool.inputSchema,
				execute: async (args) =>
					mcpManager.callTool(serverConfig.name, mcpTool.name, args),
			});
		}
	}

	return tools;
}
```

**Step 3 — Wire into orchestrator**

```typescript
const mcpManager = new McpClientManager();
try {
	const tools = await buildToolsForStep(step, mcpManager);
	await runner.run(step, { tools });
} finally {
	await mcpManager.disconnectAll();
}
```

**What this unlocks immediately:** Any MCP server from the official registry works — `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-github`, `@modelcontextprotocol/server-postgres`, and hundreds of community servers. A pipeline step gains access to your database, your GitHub issues, your filesystem — without PRISM needing to know about any of them.

---

### 3.2 Diff-aware executor

The current `executor` agent writes code without knowing what already exists. This makes it overwrite files it shouldn't touch and miss context that's already in the codebase. The fix is to feed it the git diff and a summary of relevant existing files before it writes anything.

**Create `packages/prism-sdk/src/context-builder.ts`:**

````typescript
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface CodebaseContext {
	diff: string; // current git diff
	stagedFiles: string[]; // files with staged changes
	relevantFiles: string[]; // files likely related to the task
	summary: string; // human-readable summary for the agent
}

export function buildCodebaseContext(
	workspacePath: string,
	taskDescription: string,
): CodebaseContext {
	let diff = "";
	let stagedFiles: string[] = [];

	try {
		diff = execSync("git diff HEAD", { cwd: workspacePath }).toString();
		const staged = execSync("git diff --name-only --cached", {
			cwd: workspacePath,
		})
			.toString()
			.trim();
		stagedFiles = staged ? staged.split("\n") : [];
	} catch {
		// Not a git repo or no commits yet
	}

	const relevantFiles = findRelevantFiles(workspacePath, taskDescription);

	const summary = buildSummary({
		diff,
		stagedFiles,
		relevantFiles,
		workspacePath,
	});

	return { diff, stagedFiles, relevantFiles, summary };
}

function findRelevantFiles(workspacePath: string, task: string): string[] {
	// Simple heuristic: find files whose names appear in the task description
	const words = task
		.toLowerCase()
		.split(/\W+/)
		.filter((w) => w.length > 3);
	const allFiles = walkDir(workspacePath, [
		"node_modules",
		".git",
		"dist",
		".prism",
	]);

	return allFiles
		.filter((f) => {
			const base = path.basename(f).toLowerCase();
			return words.some((word) => base.includes(word));
		})
		.slice(0, 10); // cap at 10 to avoid context bloat
}

function buildSummary(ctx: {
	diff: string;
	stagedFiles: string[];
	relevantFiles: string[];
	workspacePath: string;
}): string {
	const parts: string[] = [];

	if (ctx.diff.trim()) {
		const lines = ctx.diff.split("\n").length;
		parts.push(`Current git diff: ${lines} lines changed`);
		parts.push("```diff\n" + ctx.diff.slice(0, 3000) + "\n```");
	} else {
		parts.push("No uncommitted changes in the working directory.");
	}

	if (ctx.relevantFiles.length > 0) {
		parts.push("\nPotentially relevant existing files:");
		for (const f of ctx.relevantFiles) {
			const rel = path.relative(ctx.workspacePath, f);
			try {
				const content = fs.readFileSync(f, "utf8").slice(0, 1000);
				parts.push(`\n### ${rel}\n\`\`\`\n${content}\n\`\`\``);
			} catch {
				parts.push(`\n### ${rel} (unreadable)`);
			}
		}
	}

	return parts.join("\n");
}

function walkDir(dir: string, ignore: string[]): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (ignore.includes(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) results.push(...walkDir(full, ignore));
		else if (entry.isFile()) results.push(full);
	}
	return results;
}
````

**Inject into the executor agent's prompt:**

In `prism/src/engine/agents/executor.ts`, modify the system prompt builder:

```typescript
export function buildExecutorPrompt(
	task: string,
	context: CodebaseContext,
): string {
	return `You are a senior software engineer implementing a specific task.

## Codebase context
${context.summary}

## Your task
${task}

## Rules
- Only modify files that are necessary for this task.
- If a file already exists and works correctly, leave it alone.
- If the diff shows recent changes to a file, build on them rather than replacing them.
- Write production-quality code: error handling, edge cases, type safety.
- Output files in the format: \`### path/to/file.ts\` followed by the complete file content.`;
}
```

**Wire it into the step runner:**

```typescript
// In pi-sdk-runner.ts or the relevant runner
if (step.agent === "executor") {
	const codebaseContext = buildCodebaseContext(
		this.workspacePath,
		step.input ?? pipeline.idea,
	);
	step.systemPrompt = buildExecutorPrompt(step.input, codebaseContext);
}
```

**Optional — make it configurable in YAML:**

```yaml
- id: implement
  agent: executor
  diff_aware: true # default: true for executor, false for others
  context_files: # explicit file list overrides auto-detection
    - src/auth/middleware.ts
    - src/auth/types.ts
```

**What this changes in practice:** Instead of the agent writing a file from scratch that collides with your existing code, it reads what's already there, understands the current state, and writes only what needs to change. This is the difference between an agent that helps and one that makes a mess.

---

## Suggested order of implementation

```
Week 1  ──  SecretStorage (1.1) · CI workflow (1.2) · VSIX release (1.3)
Week 2  ──  Dry-run mode (2.5) · Parallel execution (2.1)
Week 3  ──  Conditional branching (2.2) · Per-step retry (2.3)
Week 4  ──  Output schema validation (2.4)
Week 5  ──  Diff-aware executor (3.2)
Week 6  ──  MCP integration (3.1)
```

Quick Wins first because they unblock trust. Engine Depth next because they make existing users love the tool. High Leverage last because they expand the audience — but they need a solid engine under them to work well.
