# PRISM Observability — Implementation Guide

Six systems, built in dependency order. Each section explains _what_ to build,
_where_ it lives, _why_ it works that way, and _what to watch out for_.

---

## Mental model first

Observability in PRISM has one data source and two consumers:

```
LLM API responses
       │
       ▼
  StepTelemetry          ← the one source of truth
  (per step, in memory)
       │
       ├──► RunTelemetry  → VS Code panel (live updates)
       │
       └──► AuditEvent   → decisions.jsonl (on disk, append-only)
```

Everything — cost, tokens, timeline, budget, exports — flows from
capturing `tokensIn` and `tokensOut` out of each API response and
timestamping when each step starts and ends. Get that right first
and the rest is arithmetic and display.

---

## System 1 — Token & cost tracking

### What it does

Captures input and output token counts from every LLM API response,
converts them to USD cost using a per-model rate table, and stores
them in a `StepTelemetry` object that the rest of the system reads.

### Where it lives

```
packages/prism-sdk/src/
  telemetry.ts          ← data types + cost table + arithmetic
  llm-client.ts         ← where token extraction happens (modify existing)
```

### The core data shape

`StepTelemetry` is the atom. One per pipeline step, updated in place
as the step runs:

- `stepId` — matches the `id` field in the pipeline YAML
- `agent` — which agent ran (e.g. `executor`)
- `provider` + `model` — needed to look up the cost rate
- `startedAt` / `completedAt` — Unix ms timestamps for timeline math
- `tokensIn` / `tokensOut` — raw counts from the API response
- `costUsd` — computed from tokens × rate, never stored separately
- `status` — `running` | `done` | `failed` | `skipped`

`RunTelemetry` wraps an array of `StepTelemetry` plus the run-level
fields: `runId`, `pipeline`, `budgetUsd`, `startedAt`.

### The cost rate table

Keep the rate table in one place — a `COST_TABLE` map from model
string to `{ in: number, out: number }` where values are cost per
1 million tokens in USD. This is the only place prices live; update
it when providers change pricing.

Important details about the rate table:

- Key on the **full model string** as returned by the API
  (e.g. `claude-opus-4-20250514`, not just `opus`). Providers
  sometimes ship pricing changes with a new model string suffix —
  keying on the full string means old runs keep the right rate.
- Add a fallback entry keyed `'unknown'` with zeroes so a missing
  model never throws — it just shows $0.00, which is obviously wrong
  and prompts the user to report it.
- Expose a `updateRate(model, rates)` function so users can override
  via config for enterprise pricing tiers.

### Token extraction by provider

Each provider puts usage data in a different place in the response.
Add a `extractUsage(provider, response)` function that normalises all
of them into `{ tokensIn, tokensOut }`:

**Anthropic** — `response.usage.input_tokens` and `output_tokens`.
For streaming, usage comes in the final `message_delta` event with
`type: 'message_delta'` and a `usage` field on the event. Do not sum
individual content block events — only the final delta has the total.

**OpenAI** — `response.usage.prompt_tokens` and `completion_tokens`.
For streaming, usage only appears in the final chunk when you pass
`stream_options: { include_usage: true }` in the request. Add that
flag in your OpenAI client setup or you get zeros.

**Google Gemini** — `response.usageMetadata.promptTokenCount` and
`candidatesTokenCount`. Always present in non-streaming responses.
For streaming, accumulate from the final chunk.

**Pi SDK / community providers** — inconsistent. Check the response
for `usage`, `meta.tokens`, or `x-ratelimit-remaining-tokens` headers
as fallbacks. If none found, log a warning and record zeros.

### Where to call it

In your step runner, immediately after the LLM call resolves (or
after the stream closes for streaming calls):

1. Record `completedAt = Date.now()`
2. Call `extractUsage(provider, response)` → `{ tokensIn, tokensOut }`
3. Call `computeCost(model, tokensIn, tokensOut)` → `costUsd`
4. Update the step's `StepTelemetry` in place
5. Emit `telemetry_update` to the panel
6. Append a `step_done` audit event to disk

### What to watch out for

**Thinking tokens (Anthropic extended thinking):** When
`thinking: true` is enabled, Anthropic returns a separate
`input_tokens` for the thinking budget. Add these to `tokensIn` —
they cost money and should appear in the total.

**Cached tokens:** Anthropic's prompt caching returns
`cache_read_input_tokens` at a discounted rate (10% of normal).
Track these separately in `StepTelemetry` as `tokensCachedIn` so
cost calculations are accurate. Display them in the UI as "X cached"
in a muted color — useful signal that the pipeline is benefiting from
caching.

**Retried steps:** If a step retries (see budget enforcement),
accumulate tokens across all attempts. The user should see the true
total cost of getting that step to succeed.

---

## System 2 — Budget enforcement

### What it does

Checks accumulated run cost before starting each step. Aborts the
run with a clean error if cost would exceed the configured limit.
Emits a warning event at a configurable threshold (default 80%).

### Where it lives

```
prism/src/engine/orchestrator/orchestrator.ts   ← add checks here
packages/prism-sdk/src/telemetry.ts             ← totalCost() helper
```

### How the check works

The orchestrator runs a loop that picks the next ready step and
executes it. The budget check goes at the top of that loop, before
executing anything:

1. Call `totalCost(runTelemetry)` — sum of all completed step costs
2. Compare to `runTelemetry.budgetUsd`
3. If over: throw `PrismBudgetError`, emit `budget_exceeded` audit
   event, abort the run gracefully (write partial state, close files)
4. If over the warn threshold: emit `budget_warn` to panel once (use
   a `warnEmitted` flag to avoid repeating it every step)

### YAML configuration

Budget is set at two levels:

- **Run level** — `budget_usd: 2.00` at the top of the pipeline YAML.
  Acts as a hard ceiling for the entire run.
- **Step level** — `budget_usd: 0.50` inside a step definition.
  Aborts _that step_ if it alone exceeds the cap. Useful for capping
  expensive agents like `executor` on large codebases.

Step-level budget is checked _during_ the step (on each streaming
chunk if streaming, or after the call if not). If a step exceeds its
own budget mid-stream, cancel the request and fail the step — do not
count a partial response as a success.

### The warn threshold

Emit a `budget_warning` panel message (yellow banner in the UI) when
`totalCost / budgetUsd > warnPct`. Default `warnPct` is 0.8 (80%).
Make it configurable in YAML as `budget_warn_pct: 75`.

The warning should:

- Show remaining budget in dollars, not just percentage
- List which upcoming steps are likely to cost the most based on
  their agent type and model (you can estimate from the rate table
  and typical token counts per agent)
- Offer a "proceed anyway" or "stop here" choice via a gate-style UI

### What to watch out for

**Parallel steps:** When steps run in parallel, you're committing to
their combined cost before either finishes. Before launching a
parallel group, sum the estimated cost of all steps in the group and
check that `totalCost + estimatedGroupCost <= budgetUsd`. If it would
exceed budget, decline to run the group and fail with a clear message
rather than letting one of the parallel steps overshoot.

**Estimation:** To estimate a step's cost before it runs, use
historical averages by agent type. After running a few pipelines
you'll have real data. Until then, use conservative defaults
(e.g. architect: 15k tokens, executor: 25k tokens) as a rough guard.

---

## System 3 — Run timeline DAG view

### What it does

Renders each pipeline step as a horizontal bar on a shared time axis,
grouped into rows when steps ran in parallel. Updates live as steps
complete. Each bar is clickable to show step detail.

### Where it lives

```
prism/src/panel/
  components/
    Timeline.tsx         ← the timeline component
    TimelineRow.tsx      ← one row (one step or a parallel group)
    TimelineBar.tsx      ← one bar within a row
```

### How the layout math works

The timeline is a percentage-based layout on a fixed-width track.
All positions are relative to the run's start time and the run's
total elapsed time (or current time if still running):

- **Bar left offset** = `(step.startedAt - runStart) / runDuration × 100`
- **Bar width** = `(step.completedAt - step.startedAt) / runDuration × 100`
- For still-running steps, use `Date.now()` as `completedAt` and
  pulse the right edge with a CSS animation

`runDuration` should be recalculated on every render tick (every
second while the run is active) so bars grow in real time as steps
execute. Use a `setInterval` in a `useEffect` that clears on unmount.

### Grouping parallel steps into rows

A "row" is a list of steps that do not overlap in time. The algorithm:

For each step in start-time order, find the first existing row where
no step's time range overlaps this step's time range. If found, add
to that row. If not, create a new row.

Two steps overlap if: `A.startedAt < B.completedAt && B.startedAt < A.completedAt`

Steps that haven't completed yet (still running) are treated as
overlapping with everything that starts after them.

A parallel group (multiple steps in the same row slot) should be
visually indicated — a subtle "ran in parallel" label below the pair
of rows in a different color, and a bracket or line connecting them.

### Color coding

Color encodes agent category, not step order:

- Design agents (`idea-expander`, `architect`, `requirements-engineer`) — purple
- Implementation agents (`task-generator`, `executor`) — amber
- Review agents (`critic`, `security-reviewer`, `performance-reviewer`) — coral
- Output agents (`test-writer`, `docs-writer`, `reporter`) — teal
- Gates — shown as a vertical dashed line across all rows at the gate
  timestamp, not as a bar. Gates take user time, not model time.

### Step detail on click

Clicking a bar opens a detail panel (slide-in from the right, or an
inline expand below the timeline row) showing:

- Agent name, model, provider
- Start time, end time, duration
- Tokens in / out, cost
- Output artifact path (clickable to open the file in VS Code)
- If the step failed: error message and retry count
- If the step was skipped: the condition expression that caused it

### What to watch out for

**Very fast steps** (under 5 seconds on a long run) will render as
bars too thin to click. Set a minimum visual width of 2% regardless
of actual duration. Show the real duration in a tooltip on hover.

**Live updates:** The panel receives `telemetry_update` messages from
the extension host. Each message replaces the entire `RunTelemetry`
state — don't try to merge or diff, just replace and re-render. React
will handle the diff efficiently.

**Run completed state:** When the run finishes, stop the
`setInterval` timer and lock `runDuration` to the final elapsed time.
The timeline should look identical whether you're viewing a live run
or a historical one from `.prism/runs/`.

---

## System 4 — Audit log (`decisions.jsonl`)

### What it does

Maintains an append-only, newline-delimited JSON log of every
significant event in a run. Survives crashes (each event is flushed
to disk immediately). Forms the source of truth for exports.

### Where it lives

```
prism/src/engine/audit/
  audit-writer.ts       ← appendAudit(), readAuditLog()
  audit-events.ts       ← TypeScript union type for all event shapes
```

Output path: `.prism/runs/<runId>/decisions.jsonl`

### Event taxonomy

Every event has exactly three required fields: `type`, `runId`, `ts`
(Unix ms). Everything else is event-specific.

**Lifecycle events:**

- `run_start` — pipeline name, step count, budget, user identity
- `run_done` — total cost, total tokens, duration, exit status
- `run_aborted` — reason (budget exceeded, user cancelled, crash)

**Step events:**

- `step_start` — agent, model, provider, input summary (first 100
  chars of the prompt, truncated — useful for debugging, never the
  full prompt which could be huge)
- `step_done` — tokensIn, tokensOut, costUsd, durationMs, artifact path
- `step_failed` — error message, attempt number, will retry boolean
- `step_skipped` — condition expression that caused the skip

**Gate events:**

- `gate_open` — which step triggered the gate, artifact path to show
- `gate_closed` — decision (`approved` | `rejected`), optional user
  comment, wait duration in ms

**Budget events:**

- `budget_warn` — spentUsd, budgetUsd, pct consumed
- `budget_exceeded` — spentUsd, budgetUsd, which step triggered it

### Write discipline

Each event is written as a single JSON line followed by `\n`. Use
`fs.promises.appendFile` with `'utf8'` encoding. Do not buffer events
in memory and flush in batches — append individually so a crash never
loses the last N events.

The file is created (if not exists) on `run_start`. Never truncate
or overwrite it. If a run is resumed from a checkpoint, new events
are appended to the existing file — the log is cumulative.

### Reading the log back

`readAuditLog(runDir)` reads the file line by line, parses each JSON
line, and returns an array of typed `AuditEvent` objects. Lines that
fail to parse (e.g. partial writes from a crash) should be silently
skipped with a warning — don't throw on a malformed line.

For the VS Code panel's audit log view, read the file on panel open
and then watch it with `fs.watch` for new lines while the run is
active. Append new events to the displayed list rather than re-reading
the whole file each time.

### What to watch out for

**Concurrent writes from parallel steps:** When two steps run in
parallel they both write audit events. `fs.promises.appendFile` on
the same file from the same Node.js process is safe — Node serialises
file appends. If you ever move to a multi-process architecture,
switch to a file lock or a single writer process.

**Sensitive data:** Never write full prompt content, API keys, or
user code to the audit log. The `step_start` event should include
a truncated prompt summary only. The log is intended for audit and
compliance — it should be shareable with a security reviewer without
sanitisation.

**Large runs:** A run with 20 steps and 3 retries might produce 60+
events. The log file will be tiny (< 50 KB). Don't worry about size.

---

## System 5 — Export formats

### What it does

Reads `decisions.jsonl` and produces human-readable output in two
formats: a Markdown report for compliance review (SOC 2 / ISO 27001),
and a CSV for spreadsheet analysis.

### Where it lives

```
prism/src/engine/audit/
  exporters/
    markdown.ts          ← exportAuditMarkdown()
    csv.ts               ← exportAuditCsv()
    index.ts             ← re-exports both, registers VS Code commands
```

### Markdown export — what to include

The Markdown report is for a human reviewer, not a developer. Write
it accordingly:

**Header block:**

- Run ID, pipeline name, user identity
- Start time and end time in ISO 8601 (UTC)
- Total cost in USD, total tokens
- Budget limit and % consumed
- Exit status (completed / aborted / failed)

**Step summary table:**
A Markdown table with columns: Step, Agent, Model, Duration, Tokens,
Cost, Status, Artifact. One row per step. Sort by start time.

**Gate decisions section:**
For each gate: which step triggered it, decision (APPROVED /
REJECTED in bold), who approved, how long the gate was open, and
any user comment verbatim.

**Budget events section:**
List any `budget_warn` or `budget_exceeded` events with timestamps
and amounts. If the run stayed under budget with no warnings, write
"No budget events." — auditors look for this section explicitly.

**Integrity footer:**
End the report with a SHA-256 hash of the `decisions.jsonl` file
content. This lets an auditor verify the log was not modified after
the report was generated. Include the command to verify:
`shasum -a 256 decisions.jsonl`

### CSV export — what to include

The CSV is for analysis in Excel / Google Sheets. One row per
`step_done` event. Columns:

`run_id, pipeline, step_id, agent, model, provider, started_at_iso,
completed_at_iso, duration_ms, tokens_in, tokens_out, tokens_cached,
cost_usd, status, artifact_path`

Format `cost_usd` with 6 decimal places (e.g. `0.003841`) — less
precision loses signal on cheap models. Format timestamps as ISO 8601.
Include a header row. Wrap field values containing commas in quotes.

Add a summary row at the end (row type = `TOTAL`) with summed
`duration_ms`, `tokens_in`, `tokens_out`, `cost_usd`. Leave non-
summable fields empty.

### VS Code commands to register

Two commands in `package.json` → `contributes.commands`:

- `prism.exportAuditMarkdown` — "PRISM: Export run report (Markdown)"
- `prism.exportAuditCsv` — "PRISM: Export run report (CSV)"

Both should open a VS Code save dialog pre-filled with a filename
based on the run ID:
`prism-run-20250512-143022-report.md`
`prism-run-20250512-143022-audit.csv`

After saving, show a VS Code information message with a "Open file"
button that reveals it in the system file manager.

### What to watch out for

**Incomplete runs:** The export functions must handle runs that were
aborted or crashed mid-run. Check whether `run_done` exists in the
event log. If not, mark the report header with
"⚠️ Run did not complete normally" and include whatever events
are present. Never throw on a missing final event.

**Timezone:** Write all timestamps in UTC with the `Z` suffix.
Do not use the system's local timezone — the log will be read by
people in different timezones and by automated systems. Display
local time in the VS Code panel UI (where the user is), but export
UTC everywhere.

---

## System 6 — VS Code panel wiring

### What it does

Connects all five systems above to the React panel UI. The panel
receives live telemetry updates via VS Code's webview message
passing, renders the dashboard, and sends export commands back to
the extension host.

### Where it lives

```
prism/src/extension/
  engine-bridge.ts         ← modify: emit telemetry messages

prism/src/panel/
  App.tsx                  ← add telemetry state + message listener
  components/
    ObservabilityPanel.tsx ← top-level dashboard component
    Timeline.tsx           ← (System 3)
    CostBreakdown.tsx      ← cost by step + token table
    AuditLogView.tsx       ← scrollable audit event list
    BudgetMeter.tsx        ← progress bar + warn state
```

### Message protocol

The extension host and the webview communicate via structured message
objects. Add these message types:

**Host → panel (outbound from `engine-bridge.ts`):**

- `telemetry_update` — full `RunTelemetry` snapshot, sent after every
  step event (start, done, failed, skipped) and every gate event.
  Send the whole object, not a diff — the panel replaces state, not
  merges it.
- `audit_event` — single `AuditEvent`, appended to the displayed log
  in real time without re-reading the file.
- `budget_warning` — triggers the yellow banner in the UI.

**Panel → host (inbound to `engine-bridge.ts`):**

- `export_markdown` — user clicked export; host handles file dialog
  and calls `exportAuditMarkdown()`
- `export_csv` — same for CSV
- `open_artifact` — user clicked an artifact path; host opens the
  file in the VS Code editor with `vscode.window.showTextDocument()`

### State management in the panel

Keep one top-level piece of state: `RunTelemetry | null`. Everything
else (timeline bars, cost totals, token sums, audit list) is derived
from it in render — no secondary state variables.

Exception: the audit log view maintains its own `AuditEvent[]` array
that grows by appending incoming `audit_event` messages. Don't include
the full event history in `RunTelemetry` — it would grow unbounded and
cause the host to send a larger and larger object every update.

### Live vs historical view

The panel can be opened in two modes:

**Live mode** — a run is currently executing. The panel is driven by
real-time messages. The timeline bars grow. The cost ticks up. The
audit log appends.

**Historical mode** — the user opens a past run from the PRISM sidebar
(a tree view of `.prism/runs/`). The panel reads `state.json` and
`decisions.jsonl` from disk and renders the final state statically.
No message listener needed. A "Run completed X minutes ago" label
replaces the live indicators.

Detect the mode from a `mode: 'live' | 'historical'` field in the
initial message sent when the panel is created.

### Budget meter placement

The budget meter (progress bar showing % of budget consumed) should
appear:

- In the top metric card row during a live run
- With a yellow background and warning icon when over 80%
- With a red background and "Budget exceeded" label if the run aborted
- Hidden in historical view if the run completed under budget (it's
  no longer actionable, just noise)

### What to watch out for

**Panel lifecycle:** VS Code webviews are destroyed when hidden and
recreated when shown again (depending on the `retainContextWhenHidden`
setting). If `retainContextWhenHidden: false` (the default), the
panel loses all state when the user switches tabs. Either set
`retainContextWhenHidden: true` in the webview options (increases
memory usage), or re-send the full `RunTelemetry` snapshot whenever
the panel becomes visible again. The latter is preferred — use the
`WebviewPanel.onDidChangeViewState` event to trigger a re-send from
the engine bridge.

**Message ordering:** VS Code message passing is asynchronous but
ordered (FIFO per sender). You will never receive a `step_done`
before its `step_start`. However, with parallel steps, messages from
two concurrent steps interleave arbitrarily. The panel must handle
this: receiving `step_start` for step B before `step_done` for step A
is normal and correct.

**Slow renders:** If a long pipeline produces many `telemetry_update`
messages in rapid succession (e.g. 5 parallel steps all completing
within 100ms), the panel can receive more updates than it can render.
Debounce the `telemetry_update` handler with a 150ms delay — the UI
still feels live but doesn't thrash React's reconciler.

---

## Integration checklist

Before shipping, verify these end-to-end:

- [ ] A completed run produces a `decisions.jsonl` with `run_start`
      and `run_done` events bookending all step events
- [ ] Total cost shown in the panel matches the sum of per-step costs
      (no rounding drift)
- [ ] A run that exceeds budget aborts cleanly with a user-visible
      error and a partial `decisions.jsonl` that ends with
      `budget_exceeded`
- [ ] The timeline shows parallel steps on separate rows with no
      overlap in their time bars
- [ ] Exporting Markdown produces a file that opens correctly in
      GitHub's Markdown renderer
- [ ] The CSV import into Google Sheets without format errors
- [ ] Opening a historical run from the sidebar shows a static panel
      with the correct final state
- [ ] The budget meter turns yellow at 80% and red at 100%
- [ ] Cached tokens (Anthropic) are tracked separately and shown in
      the token breakdown with a muted label
