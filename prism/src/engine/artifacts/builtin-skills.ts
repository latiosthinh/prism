import { SkillEntry } from "./skill-loader.js";

export const BUILTIN_SKILLS: SkillEntry[] = [
  {
    id: "cursor-sdk-patterns",
    label: "Cursor SDK Patterns",
    description:
      "Verified patterns for @cursor/sdk — Agent.create, streaming, tools, errors",
    category: "technical",
    version: "1.1.0",
    content: `# Cursor SDK Patterns

## Verified Agent Creation
\`\`\`ts
import { Agent } from "@cursor/sdk";

const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});
\`\`\`

- \`apiKey\` is REQUIRED. Without it the create call fails fast (~300ms).
- \`model.id\` accepts \`"composer-2"\` or \`"default"\`. Other IDs may be rejected by the backend.
- \`local.cwd\` MUST be an absolute path to a directory the SDK can read/write.
- Do NOT pass \`sandboxOptions: { enabled: false }\` — it's the default. Only override if you have a custom \`~/.cursor/sandbox.json\` you want to disable.
- Always \`await agent.close()\` in a \`finally\` block.

## Sending and Streaming
\`\`\`ts
const run = await agent.send("Summarize what this repository does");

for await (const event of run.stream()) {
  switch (event.type) {
    case "system": /* handshake */ break;
    case "thinking": /* model reasoning */ break;
    case "assistant": /* text or tool_use blocks */ break;
    case "tool_call": /* status: running → completed | error */ break;
    case "status": /* run lifecycle */ break;
  }
}

const result = await run.wait(); // { status, result, errorCode? }
\`\`\`

## Result Status Handling
- \`status: "completed"\` — happy path, \`result\` contains final assistant text.
- \`status: "error"\` — read \`errorCode\` and \`result\` for diagnostics. If duration < 1s and no model id was rejected, it's almost always a missing/invalid API key or stale extension bundle.
- \`status: "cancelled"\` — caller aborted via signal.

## Common Failure Modes
- **"agent error" in <500ms** — missing API key, stale bundle, or unknown model id. Verify with the standalone probe script.
- **Per-event stream error** — catch inside the for-await; close agent; rethrow with context.
- **Unsupported model** — cache the rejected id and fall back to \`"default"\` for the rest of the session.

## Tool Surface (composer-2)
The agent has filesystem + shell tools available: \`read\`, \`write\`, \`write_file\`, \`edit\`, \`create_file\`, \`grep\`, \`glob\`, \`shell\`, \`task\`. Always instruct the agent to use \`write\` or \`write_file\` to persist artifacts — relying on the assistant text alone is brittle.

## Cancellation
\`\`\`ts
const ctl = new AbortController();
const run = await agent.send(prompt, { signal: ctl.signal });
// later: ctl.abort()
\`\`\`
`,
  },
  {
    id: "prompt-engineering",
    label: "Prompt Engineering",
    description:
      "Practical patterns for system prompts, few-shot, role priming, and output contracts",
    category: "technical",
    version: "1.0.0",
    content: `# Prompt Engineering

## The 5-Part System Prompt
1. **Role**: "You are a senior X engineer who specializes in Y."
2. **Process**: Ordered steps the model should follow before responding.
3. **Rules**: Hard constraints (must-do, must-not-do).
4. **Output Format**: Required sections, schema, or template.
5. **Tools**: When and how to call external tools (write_file, shell, etc.).

## Output Contracts
- For machine-consumed output: specify a strict format (JSON schema, fenced code block).
- For human-consumed output: list required sections with one-line descriptions.
- Always tell the model where to write artifacts: \`Use the write tool to save to design.md\`.

## Few-Shot When to Use
- Tasks with format the model gets wrong without examples.
- 1-3 examples is usually enough; more often hurts.
- Examples should cover the full output range, including the edge case you care about.

## Role Priming
- "Senior" / "Staff" framing biases toward more rigorous, structured responses.
- Adding "before you write, think about X, Y, Z" improves quality more than asking for the answer directly.

## Anti-Patterns
- Vague: "Be helpful and accurate" → meaningless.
- Conflicting: "Be concise but cover everything in detail" → model picks one.
- Negative-only: "Don't be wrong" → tell it what right looks like instead.
- Overloaded: 10 personas in one prompt → splits attention; split into agents instead.
`,
  },
  {
    id: "error-handling-patterns",
    label: "Error Handling Patterns",
    description:
      "Robust error handling: typed errors, recovery strategies, and observability",
    category: "technical",
    version: "1.0.0",
    content: `# Error Handling Patterns

## Typed Errors
- Define an error hierarchy: \`AppError\` → \`ValidationError\`, \`NotFoundError\`, \`AuthError\`, \`ExternalError\`.
- Each error class carries: code, http status, user-safe message, and original cause.
- Never throw bare strings. Never throw \`null\`/\`undefined\`.

## Result vs Throw
- **Throw** for unexpected failures (programmer errors, infra failures).
- **Result type** (\`{ ok: true, value } | { ok: false, error }\`) for expected outcomes — validation, business rules, parsing.
- Discriminated unions force callers to handle both branches.

## Retry Strategy
- Idempotent operations only. Never retry POSTs that create resources without an idempotency key.
- Exponential backoff with jitter: \`baseMs * 2^attempt + random(0..baseMs)\`.
- Cap retries (3-5) and total wait (~30s typical).
- Distinguish retryable (5xx, network, throttle) vs non-retryable (4xx except 408/429).

## Boundary Catches
- Catch at boundaries: HTTP handler, message consumer, scheduled job entry.
- Inside boundaries, let errors propagate — don't swallow them with \`try {} catch {}\`.
- A swallowed error is a future 3am page.

## User-Facing Messages
- Never expose stack traces, SQL, or internal IDs.
- Map error codes to safe, actionable messages: "Couldn't reach payments — try again in a moment."
- Always log the full error server-side with correlation ID.

## Recovery Patterns
- **Circuit breaker**: open the circuit after N consecutive failures; half-open after cooldown.
- **Bulkhead**: isolate failing dependencies in their own pool/thread.
- **Fallback**: degraded result is better than an error (cached value, default config).
- **Compensating action**: for failed multi-step transactions, undo earlier steps explicitly.
`,
  },
  {
    id: "observability-logging",
    label: "Observability & Logging",
    description:
      "Structured logs, metrics, traces, and the three-pillar approach to debugging",
    category: "technical",
    version: "1.0.0",
    content: `# Observability & Logging

## Three Pillars
1. **Logs** — discrete events with context. Use for "what exactly happened on this request?".
2. **Metrics** — aggregated time-series. Use for "how is the system behaving overall?".
3. **Traces** — causally-linked spans. Use for "why is this request slow?".

## Structured Logs
- JSON only. Never log unstructured strings in production.
- Required fields: \`ts\`, \`level\`, \`msg\`, \`service\`, \`traceId\`, \`spanId\`, \`userId?\`, \`requestId?\`.
- Log levels: ERROR (action needed) > WARN (suspicious) > INFO (lifecycle) > DEBUG (deep dive). No INFO spam in hot paths.

## What to Log
- **Always**: request entry/exit, errors with stack, external calls (with duration).
- **Never**: full request bodies (PII), API keys, tokens, passwords, full stack traces in user responses.
- **Sometimes**: state transitions, feature-flag evaluations, business decisions (with redacted PII).

## Metrics: RED + USE
- **RED** (services): Rate, Errors, Duration. p50/p95/p99 latency.
- **USE** (resources): Utilization, Saturation, Errors. CPU, memory, disk, queue depth.
- Tag wisely: high-cardinality tags (user_id) explode storage costs. Use bounded tags (region, tier).

## Tracing
- Propagate \`traceId\` from edge to backend to background workers.
- Span every external call (HTTP, DB, cache, queue) with attributes (URL, query, status).
- Sample intelligently: head-based (1%) for steady state, tail-based for errors and slow requests.

## Alerting
- Alert on symptoms (user-facing impact), not causes (CPU at 90%).
- Every alert must be actionable. If you'd ignore it at 3am, delete it.
- SLO-based alerts: error budget burn rate.
`,
  },
  {
    id: "accessibility-a11y",
    label: "Accessibility (a11y)",
    description:
      "WCAG 2.2 AA compliance — semantic HTML, ARIA, keyboard nav, screen readers",
    category: "technical",
    version: "1.0.0",
    content: `# Accessibility (a11y)

## Foundations
- Use semantic HTML first: \`<button>\`, \`<nav>\`, \`<main>\`, \`<form>\`, \`<label>\`. ARIA is a fallback, not a starter.
- One \`<h1>\` per page; heading hierarchy must not skip levels.
- Every interactive element needs an accessible name (label, aria-label, or visible text).

## Keyboard
- All interactive elements must be reachable with Tab.
- Focus must be visible (don't kill the outline without replacing it).
- Custom widgets follow ARIA Authoring Practices — Combobox, Dialog, Menu have specific keyboard contracts.
- Trap focus in modals; restore focus on close.

## Screen Readers
- Test with VoiceOver (Mac), NVDA (Windows), TalkBack (Android).
- Decorative images: \`alt=""\`. Informative images: meaningful alt. Functional images (icon buttons): describe the action.
- \`aria-live="polite"\` for status updates. \`aria-live="assertive"\` for errors only.
- Don't change content based on focus alone (WCAG 3.2.1).

## Color & Contrast
- Text vs background: 4.5:1 (normal), 3:1 (large/bold).
- UI components and graphical objects: 3:1.
- Never convey information by color alone — pair with text or icon.

## Forms
- \`<label for="...">\` linked to every input. Placeholders are NOT labels.
- Error messages near the field, with \`aria-describedby\` linking input to message.
- Required fields: \`aria-required="true"\` AND visible indicator.

## Quick Audit Checklist
- [ ] Tab through entire page — can reach everything?
- [ ] Disable CSS — does content order make sense?
- [ ] Run axe / Lighthouse — zero serious violations.
- [ ] Test with screen reader on the critical flow.
- [ ] All form fields have visible labels.
- [ ] All images have appropriate alt.
`,
  },
  {
    id: "api-design",
    label: "API Design",
    description:
      "REST resource modeling, versioning, error envelopes, and pagination",
    category: "technical",
    version: "1.0.0",
    content: `# API Design

## Resource Modeling
- Nouns, not verbs: \`/orders/123\`, not \`/getOrder?id=123\`.
- Plural collections: \`/users\`, not \`/user\`.
- Nested resources for ownership: \`/users/42/orders\`.
- Avoid deep nesting beyond 2 levels — use query filters instead.

## HTTP Methods
- GET: safe + idempotent. Never modify state.
- POST: create OR non-idempotent action. Returns the created resource.
- PUT: full replace, idempotent. PATCH: partial update, idempotent if same patch.
- DELETE: idempotent — deleting twice gives 404 the second time, not an error.

## Status Codes
- 200 OK, 201 Created (with Location header), 202 Accepted (async).
- 400 validation error, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict, 422 semantic error.
- 429 rate limited (with Retry-After), 500 server error, 503 unavailable.

## Error Envelope
\`\`\`json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order 123 not found",
    "details": { "orderId": "123" },
    "requestId": "req_abc"
  }
}
\`\`\`

## Pagination
- Cursor-based for large/changing datasets: \`?cursor=...&limit=50\`. Returns \`nextCursor\`.
- Offset only for small, stable datasets.
- Always include \`limit\` with a server-enforced max.

## Versioning
- URL path (\`/v1/orders\`) is most explicit. Header (\`Accept: application/vnd.api+json;v=1\`) is cleaner but harder to debug.
- Add fields freely (non-breaking). Remove or change semantics → new version.
- Deprecate with \`Sunset\` and \`Deprecation\` headers; give consumers 6+ months.

## Idempotency
- Mutating endpoints accept \`Idempotency-Key\` header. Server caches result for the key for ~24h.
- Without it, retry-on-network-error becomes a duplicate-charge incident.
`,
  },
  {
    id: "database-migrations",
    label: "Database Migrations",
    description:
      "Safe, reversible, zero-downtime schema changes (expand → migrate → contract)",
    category: "technical",
    version: "1.0.0",
    content: `# Database Migrations

## Golden Rule: Expand → Migrate → Contract
Never combine expand and contract in one deploy. The app must work with both old and new schema during the transition.

1. **Expand**: add new columns/tables; new code writes to both old and new.
2. **Migrate**: backfill data in batches; verify consistency.
3. **Switch reads**: new code reads from new schema; verify in prod.
4. **Contract**: drop old columns/tables in a separate deploy after verification window.

## Safe Operations (no lock)
- Add nullable column.
- Add new table.
- Add index CONCURRENTLY (Postgres) or ONLINE (MySQL 8+).
- Drop a column or index that nothing uses.

## Dangerous Operations (lock or downtime)
- Add NOT NULL column without default → write a default in migration AND backfill, then add constraint.
- Rename column → expand + migrate + contract; never rename in place.
- Change column type → add new column with new type, dual-write, backfill, swap reads, drop old.
- Add a unique constraint → CREATE UNIQUE INDEX CONCURRENTLY first, then add constraint USING that index.

## Migration File Rules
- Each migration is reversible (\`up\` and \`down\`) unless explicitly destructive.
- Migrations are append-only — never edit a committed migration. Add a new one to fix.
- One logical change per migration. Smaller is safer.
- Migrations run in deterministic order (timestamps or sequential numbers).

## Backfills
- For tables > 1M rows: batched updates with \`LIMIT\` and a sleep, not a single \`UPDATE table SET ...\`.
- Wrap in a transaction per batch, not the whole backfill.
- Run during off-peak; monitor replication lag.

## Verification
- Before drop: check \`pg_stat_user_tables\`, \`information_schema\`, or app metrics — no reads/writes for 24-48h.
- Always have a rollback plan: snapshot before destructive ops; feature-flag the consumer.
`,
  },
  {
    id: "git-conventions",
    label: "Git Conventions",
    description:
      "Conventional commits, PR hygiene, branching, and review etiquette",
    category: "technical",
    version: "1.0.0",
    content: `# Git Conventions

## Conventional Commits
\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

- **Types**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- **Scope**: optional, e.g. \`feat(auth): ...\`. Use the affected module.
- **Subject**: imperative mood, lowercase, no period, ≤72 chars.
- **Body**: explain *why*, not *what*. Wrap at 72 chars.
- **Footer**: \`BREAKING CHANGE: ...\`, \`Closes #123\`, \`Co-authored-by: ...\`.

## Branching
- Trunk-based for fast-moving teams: short-lived feature branches off main, rebased often.
- Branch names: \`type/short-description\` (e.g., \`feat/add-dark-mode\`, \`fix/null-pointer-in-checkout\`).
- One concern per branch; one branch per concern.

## Pull Requests
- **Title**: same conventional commit format. The PR title becomes the squash-merge subject.
- **Description**: what + why + how to verify. Include screenshots/recordings for UI changes.
- **Size**: aim for <400 LOC diff. Bigger PRs get rubber-stamped, not reviewed.
- **Self-review**: read your own diff before requesting review. Catch the obvious stuff.

## Review Etiquette
- Critique the code, not the author.
- Distinguish blocking from suggestion: prefix nits with \`nit:\`.
- Approve with confidence; don't approve "to unblock" without reading.
- Resolve threads when fixed; let the reviewer mark out-of-scope ones resolved.

## When Things Go Wrong
- Pushed a secret? Rotate immediately. Then \`git filter-repo\` or BFG to scrub history. Never just delete the commit.
- Bad merge? \`git revert\` (creates a new commit). Avoid \`reset --hard\` on shared branches.
- Need to fix a pushed commit? \`git commit --amend\` then \`git push --force-with-lease\` ONLY on your own feature branch.

## Hooks
- Pre-commit: format, lint, type-check on staged files (use lint-staged).
- Pre-push: run unit tests.
- Commit-msg: validate conventional commit format (use commitlint).
`,
  },
  {
    id: "security-owasp",
    label: "Security — OWASP Top 10",
    description: "OWASP Top 10 (2021) — categories, examples, and mitigations",
    category: "quality",
    version: "1.0.0",
    content: `# Security — OWASP Top 10 (2021)

## A01: Broken Access Control
- Enforce auth at every route, not just the UI. Default deny.
- Object-level checks: "user X owns resource Y?" on every read/write.
- Don't trust IDs from the client (\`/orders/:id\` — verify ownership).

## A02: Cryptographic Failures
- TLS everywhere — no plaintext over the network.
- Hash passwords with argon2id or bcrypt (cost ≥ 12). Never SHA-256.
- Don't roll your own crypto. Use battle-tested libraries.
- Store secrets in a vault (AWS Secrets Manager, Vault, sealed-secrets), not env files in git.

## A03: Injection
- Parameterized queries always. \`SELECT * FROM users WHERE id = ?\`, not string concat.
- For NoSQL/ORM: use the typed query builder, not raw query objects from user input.
- Shell commands: avoid \`exec\`. If you must, allowlist arguments and use array form.
- HTML output: auto-escape (React does, raw \`dangerouslySetInnerHTML\` does not).

## A04: Insecure Design
- Threat-model the feature BEFORE coding. STRIDE per data flow.
- Rate limit destructive endpoints (login, password reset, payments).
- Default-secure config: opt out of safety, not into it.

## A05: Security Misconfiguration
- Remove default accounts and sample apps before deploy.
- Strip headers that reveal stack: \`Server\`, \`X-Powered-By\`.
- Set security headers: \`Content-Security-Policy\`, \`Strict-Transport-Security\`, \`X-Content-Type-Options: nosniff\`, \`Referrer-Policy\`.

## A06: Vulnerable Components
- \`npm audit\` / \`pip-audit\` / \`cargo audit\` in CI; fail on high+.
- Pin versions. Dependabot/Renovate for managed updates.
- Subresource Integrity (\`integrity="sha384-..."\`) for CDN scripts.

## A07: Identification & Auth Failures
- MFA on all admin/sensitive accounts.
- Session: HttpOnly + Secure + SameSite=Lax cookies. Rotate on privilege escalation.
- Lock account after N failed attempts (with exponential backoff).
- Password policy: length over complexity. Block top-1000 breached passwords.

## A08: Software & Data Integrity
- Verify signatures on packages, container images, deploy artifacts.
- CI/CD: protected branches, required reviews, signed commits.
- Don't deserialize untrusted data without strict schema validation.

## A09: Logging & Monitoring Failures
- Log all auth events (login, logout, password change, MFA enroll, permission change).
- Detect impossible-travel logins, brute force, mass exfiltration.
- Centralize logs; alert on suspicious patterns.

## A10: Server-Side Request Forgery (SSRF)
- Allowlist target hosts. Block private IP ranges (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8).
- Resolve DNS server-side and re-validate before connecting.
- For URL fetching features: use a hardened HTTP client with explicit allowlist.
`,
  },
  {
    id: "performance-profiling",
    label: "Performance Profiling",
    description:
      "Measuring before optimizing — flamegraphs, p99, and the cost-of-correctness mindset",
    category: "quality",
    version: "1.0.0",
    content: `# Performance Profiling

## Measure First, Optimize Second
- Never optimize without a baseline. "It feels slow" is not a metric.
- Choose ONE primary metric per workload (p99 latency for serving, throughput for batch, memory for embedded).
- Re-measure after every change. Big surprises mean your model is wrong.

## Latency Tail Matters
- Mean lies. Median understates. Use p95/p99 for user-facing latency.
- A service that's fast for 99% of requests but 30s for 1% will lose users.
- Reduce tail latency: hedged requests, request coalescing, slower-than-X timeouts with retries.

## Profiling Tools
- **Node**: \`--inspect\`, \`clinic.js\` (doctor/flame/bubbleprof), \`0x\` for flamegraphs.
- **Browser**: Chrome DevTools Performance tab; Lighthouse for Core Web Vitals.
- **Backend**: pyspy/py-spy (Python), \`pprof\` (Go), JFR/async-profiler (JVM).
- **DB**: \`EXPLAIN ANALYZE\`, slow query log, query plan diff between staging/prod.

## Common Hot Spots
- **N+1 queries**: load related data in batch, not in a loop.
- **Sync blocking I/O**: file reads, sleeps, or sync DB calls in async code starve the event loop.
- **Allocation churn**: object creation in hot loops → use object pools or pre-allocate.
- **Re-render storms** (React): unnecessary state updates, unmemoized callbacks, key churn.
- **Bundle bloat**: dynamic import for routes; tree-shake; check \`webpack-bundle-analyzer\`.

## Database Performance
- Read \`EXPLAIN ANALYZE\` of every query that runs > 100ms in prod.
- Index for the actual query patterns. Composite index column order matters: equality first, range last.
- Cache reads of slow-changing data (Redis, in-memory LRU). Invalidate on write.
- Connection pool size = min(CPUs * 2, expected concurrency). Too many = lock contention.

## Front-End Web Vitals
- **LCP** ≤ 2.5s — hero image, fonts, first paint.
- **INP** ≤ 200ms — main thread responsiveness during interaction.
- **CLS** ≤ 0.1 — explicit dimensions on images, reserve ad space, no late layout shifts.

## Cost-of-Correctness Mindset
- Sometimes correctness is the bottleneck (extra round trip for safety). Don't trade correctness for speed without an explicit decision.
- "It's slow but correct" beats "fast but sometimes wrong" in 95% of business contexts.
`,
  },
  {
    id: "react-best-practices",
    label: "React Best Practices",
    description:
      "Modern React patterns, hooks, performance optimization, and conventions",
    category: "technical",
    version: "1.0.0",
    content: `# React Best Practices

## Component Patterns
- Prefer function components with hooks over class components.
- Keep components small and focused on a single responsibility.
- Extract reusable logic into custom hooks (useCounter, useAuth, etc.).
- Use React.memo for expensive renders with stable props.

## Hooks Rules
- Only call hooks at the top level (not in conditions, loops, callbacks).
- Only call hooks from React functions or custom hooks.
- Dependencies array in useEffect/useMemo/useCallback must include all reactive values.
- useCallback for function props passed to memo'd children.
- useMemo for expensive computations, not for trivial operations.

## State Management
- Local state: useState for component-only state.
- Lifted state: share via props to children.
- Context: for global concerns (theme, auth, locale), not for state that changes frequently.
- Avoid prop drilling beyond 3 levels — use composition or context.

## Performance
- Lazy load route-level components with React.lazy + Suspense.
- Virtualize long lists (react-window, react-virtuoso).
- Debounce rapid state updates (search inputs, resize handlers).
- Avoid useEffect for derived state — compute during render.

## Styling
- Tailwind CSS utility classes for most styling.
- CSS modules or CSS-in-JS for complex component-specific styles.
- Avoid inline styles for everything except dynamic values.
`,
  },
  {
    id: "typescript-best-practices",
    label: "TypeScript Best Practices",
    description:
      "TypeScript patterns, type safety, generics, and project conventions",
    category: "technical",
    version: "1.0.0",
    content: `# TypeScript Best Practices

## Types vs Interfaces
- Use \`interface\` for public API shapes and object types that may be extended.
- Use \`type\` for unions, intersections, tuples, and mapped types.
- Prefer \`interface\` for React component Props.

## Generics
- Use generics for reusable functions, hooks, and components.
- Constrain with \`extends\` rather than leaving unbounded.
- Use \`as const\` for literal types.
- Use \`satisfies\` operator for type validation without widening.

## Error Handling
- Use discriminated unions for API responses: \`{ status: 'success', data: T } | { status: 'error', error: E }\`.
- Always type catch clauses with \`unknown\` and narrow.
- Avoid throwing non-Error values.

## Strict Mode
- Enable \`strict: true\` in tsconfig.
- Use \`noUncheckedIndexedAccess\` for safer object access.
- Prefer \`Record<string, T>\` over \`{ [key: string]: T }\`.

## Common Patterns
- Zod schemas for runtime validation → infer types with \`z.infer\`.
- Branded types for type-safe IDs: \`type UserId = string & { __brand: 'UserId' }\`.
- Template literal types for event/message type safety.
`,
  },
  {
    id: "code-review-guidelines",
    label: "Code Review Guidelines",
    description:
      "Systematic code review checklist for correctness, security, and maintainability",
    category: "quality",
    version: "1.0.0",
    content: `# Code Review Guidelines

## Correctness
- Does the code satisfy all acceptance criteria?
- Are edge cases handled (empty state, error state, boundary values)?
- Are there any race conditions or timing bugs?
- Do error paths clean up resources properly?

## Security
- Are user inputs validated and sanitized?
- Are secrets and API keys properly handled (never hardcoded)?
- Is authentication/authorization checked at every boundary?
- Are there any injection vulnerabilities (XSS, SQLi, command injection)?

## Performance
- Are there unnecessary re-renders in React?
- Are expensive operations memoized or cached?
- Are large datasets paginated or virtualized?
- Are there N+1 query patterns?

## Maintainability
- Is the code consistent with existing patterns in the codebase?
- Are functions and variables named clearly?
- Are there magic numbers or hardcoded strings that should be constants?
- Is there dead code or commented-out code?

## Verdict
- **PASS**: All criteria met, no blocking issues.
- **FAIL**: Specific, actionable issues found that must be fixed before merge.
`,
  },
  {
    id: "testing-strategies",
    label: "Testing Strategies",
    description:
      "Test pyramid, mocking strategies, coverage goals, and testing patterns",
    category: "quality",
    version: "1.0.0",
    content: `# Testing Strategies

## Test Pyramid
- **Unit tests** (70%): Test individual functions and components in isolation.
- **Integration tests** (20%): Test module interactions and API contracts.
- **E2E tests** (10%): Test critical user journeys end-to-end.

## Unit Testing Patterns
- Test the public API, not implementation details.
- One assertion concept per test.
- Use descriptive test names: "should [expected behavior] when [condition]".
- Arrange → Act → Assert structure.
- Mock at boundaries (API calls, file system, database).

## React Component Testing
- Test behavior, not implementation (don't assert on internal state).
- Use screen queries by role/text for accessibility-aware tests.
- Test user interactions (click, type, submit) not function calls.
- Mock child components only when they have side effects.

## Coverage Goals
- Line coverage: >80%
- Branch coverage: >70%
- Focus on critical paths and error handlers.
- Don't chase 100% — prioritize meaningful coverage.

## Test Types
- Snapshot tests for UI regression (use sparingly).
- Property-based tests for data transformations.
- Contract tests for API boundaries.
`,
  },
  {
    id: "brainstorming-frameworks",
    label: "Brainstorming Frameworks",
    description:
      "Structured creative thinking methodologies for expanding and refining ideas",
    category: "product",
    version: "1.0.0",
    content: `# Brainstorming Frameworks

## SCAMPER Method
- **S**ubstitute — What can be replaced?
- **C**ombine — What can be merged?
- **A**dapt — What can be modified?
- **M**odify/Magnify — What can be changed or emphasized?
- **P**ut to other use — What other use cases exist?
- **E**liminate — What can be removed?
- **R**earrange/Reverse — What can be reordered or flipped?

## Crazy 8s
Sketch 8 distinct variations in 8 minutes. Forces rapid divergent thinking before converging.

## User Story Mapping
1. Frame the user's journey as a narrative.
2. Break into steps (backbone).
3. For each step, brainstorm alternatives, details, edge cases.
4. Prioritize by user value vs effort.

## Assumption Surfacing
For every claim in the idea, ask:
- "What must be true for this to work?"
- "How would we validate this?"
- "What happens if we're wrong?"

## Output Format
Always produce: problem statement, proposed solution, user stories, scope boundaries, and assumptions checklist.
`,
  },
  {
    id: "requirements-specification",
    label: "Requirements Specification",
    description:
      "Writing clear, testable requirements with acceptance criteria in Given/When/Then format",
    category: "product",
    version: "1.0.0",
    content: `# Requirements Specification

## Requirement Structure
Every requirement should include:
1. **ID**: Unique identifier (R1, R2, etc.)
2. **Title**: Short imperative description
3. **Description**: 1-3 sentence explanation of what and why
4. **Priority**: MUST / SHOULD / MAY (per RFC 2119)
5. **Acceptance Criteria**: Given/When/Then scenarios

## Given/When/Then Format
\`\`\`
Scenario: [title]
  Given [precondition(s)]
    And [additional precondition]
   When [action is performed]
   Then [expected outcome]
    And [additional outcome]
\`\`\`

## Functional vs Non-Functional
- **Functional**: What the system does (features, behaviors, API endpoints).
- **Non-Functional**: Qualities of the system (performance: <200ms p95, security: OWASP Top 10, availability: 99.9%).

## Traceability
- Each requirement traces to: user story → requirement → acceptance criteria → test case.
- Each requirement has a testable outcome.
- Mark requirements that depend on unconfirmed assumptions.

## Common Pitfalls
- "The system should be fast" → Not testable. Replace with "p95 response time < 200ms".
- "User-friendly interface" → Not testable. Replace with specific UX criteria.
- "Appropriate error handling" → Not testable. List specific error scenarios and responses.
`,
  },
  {
    id: "software-architecture",
    label: "Software Architecture Patterns",
    description:
      "Common architecture patterns, trade-offs, and documentation approaches",
    category: "technical",
    version: "1.0.0",
    content: `# Software Architecture Patterns

## Layered Architecture
- **Presentation** → **Application** → **Domain** → **Infrastructure**
- Dependencies point inward (domain has no external deps).
- Each layer communicates via interfaces.

## Key Decisions to Document
For every architectural decision, record:
1. **Context**: What problem are we solving?
2. **Options**: What alternatives were considered?
3. **Decision**: Which option and why?
4. **Trade-offs**: What did we sacrifice?
5. **Risks**: What could go wrong and how to mitigate?

## Common Patterns
- **Event-Driven**: Decoupled services communicate via events. Good for scalability, hard to debug.
- **CQRS**: Separate read and write models. Good for complex queries, adds complexity.
- **Strategy Pattern**: Swap algorithms at runtime. Good for variant behaviors.
- **Observer/Pub-Sub**: One-to-many notifications. Good for event handling.

## Component Design
Each component should specify:
- Responsibility (what it does)
- Interface (how to call it)
- Dependencies (what it needs)
- State (what it remembers)
- Complexity estimate (S/M/L/XL)
- Files that implement it
`,
  },
  {
    id: "task-decomposition",
    label: "Task Decomposition",
    description:
      "Breaking down implementation plans into small, ordered, executable tasks",
    category: "technical",
    version: "1.0.0",
    content: `# Task Decomposition

## Principles
- Each task is one coherent change (a single file addition/modification).
- Tasks are ordered by dependency (blockers first).
- Each task has a clear completion criterion.
- Total task scope should cover the entire implementation plan.

## Task Classification
- **YOLO**: Low risk, self-contained, reversible. Auto-execute without review.
- **GATE**: High risk. Must pause for human approval before execution.

## Auto-GATE Rules
Mark as GATE if the task:
- Modifies auth, permissions, or security logic
- Changes database schema or migrations
- Touches external API contracts or integrations
- Modifies deployment or CI/CD configuration
- Deletes or renames files
- Modifies shared types/interfaces used across modules
- Changes build configuration

## Task Format
Each task must specify:
- **ID**: T1, T2, T3...
- **Title**: Short imperative ("Create the auth context provider")
- **Mode**: [yolo] or [gate]
- **Risk**: High / Medium / Low
- **Files**: Exact file paths this task touches
- **Depends on**: Task IDs that must complete first
- **Implements**: Requirement IDs this task satisfies
`,
  },
];
