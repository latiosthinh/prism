# Custom Agents

PRISM ships with 12 built-in agents covering the full SDLC. You can also write your own custom agents to fit your team's specific workflows.

## Agent File Structure

Custom agents live in `.prism/agents/` in your workspace root. Each agent is a Markdown file:

```
workspace/
└── .prism/
    └── agents/
        └── my-custom-agent.md
```

## Agent Format

An agent file is a standard Markdown file. The content of the file is the **system prompt** — it tells the AI model what role to play and how to behave.

```markdown
You are a database migration expert. Your job is to:

1. Review the schema changes proposed in the previous step
2. Write safe, rollback-compatible migration files
3. Add tests for each migration
4. Document any breaking changes

Guidelines:
- Always wrap DDL statements in transactions
- Add both `up` and `down` migrations
- Include inline comments explaining each change
- Never drop columns — mark them as deprecated instead
```

## Available Context Variables

Agents receive the following context at runtime:

| Variable | Description |
|----------|-------------|
| `{{idea}}` | The original idea/prompt that started the pipeline |
| `{{artifacts.<step-id>}}` | Output from a previous step (e.g., `{{artifacts.architect}}`) |
| `{{system-prompt}}` | The agent's own system prompt |
| `{{skillsContext}}` | Concatenated content from all assigned skill files |
| `{{cwd}}` | Current working directory (workspace root) |
| `{{step}}` | Current step name and id |
| `{{tags}}` | Current step's tags |

## Registering an Agent

Agents are automatically discovered from `.prism/agents/`. Place a Markdown file there and reference it by filename (without extension) in your pipeline YAML:

```yaml
steps:
  - id: migrate
    name: "Database Migration"
    agent: my-custom-agent     # references .prism/agents/my-custom-agent.md
    artifact: .prism/artifacts/migration-plan.md
```

## Agent Output Validation

Each agent should follow these output conventions:

1. **Primary output** — write complete results to the artifact file
2. **Task checklists** — use `- [ ]` and `- [x]` checkboxes for trackable tasks
3. **Decisions** — log key decisions clearly for the audit trail

## Testing Custom Agents

1. Create a test pipeline with a single step using your agent
2. Run with `prism.dryRun` first to validate
3. Run for real and review the output in the artifact viewer
4. Iterate on the system prompt until the output quality meets your standards

## Best Practices

- **Be specific** — vague prompts produce vague output
- **Set constraints** — tell the agent what NOT to do as well as what TO do
- **Use gates** — put `gate: true` on critical agent steps for human review
- **Assign skills** — use the skills system to provide reusable context (e.g., project conventions, API docs)
- **Keep agents focused** — one agent, one responsibility

## Built-in Agents Reference

| Agent | Description |
|-------|-------------|
| `idea-expander` | Expands raw ideas into structured requirements |
| `requirements-engineer` | Produces formal, testable requirements |
| `architect` | Designs system architecture and component breakdown |
| `task-generator` | Breaks requirements into implementable tasks |
| `executor` | Writes code that implements tasks |
| `critic` | Reviews code for issues and suggests improvements |
| `test-writer` | Writes unit, integration, and E2E tests |
| `reporter` | Generates summary reports of pipeline runs |
| `security-reviewer` | Audits code for security vulnerabilities |
| `performance-reviewer` | Identifies performance bottlenecks |
| `docs-writer` | Generates documentation from code |
| `migration-planner` | Plans database and infrastructure migrations |
