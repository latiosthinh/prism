# Providers

PRISM supports multiple AI providers through a three-backend architecture. This document covers the capabilities, configuration, and limitations of each.

## Provider Comparison Matrix

| Feature | Cursor SDK | Pi SDK | Anthropic Direct |
|---------|-----------|--------|------------------|
| Streaming | Yes | Yes | Yes |
| Tool use | Yes | Yes | Yes |
| Thinking/reasoning | Yes | Yes | Yes |
| Context window | 200K | Provider-dependent | 200K |
| Max output tokens | 8192 | Provider-dependent | 8192 |
| Cost estimate | Cursor subscription | Per-token pricing | Per-token pricing |
| Best for | Code generation | Multi-provider flexibility | Structured output |

## Cursor SDK

The default backend. Uses Cursor's composer-2 model for agent-driven development.

### Configuration

```json
{
  "prism.backend": "cursor",
  "prism.apiKey": "key_..."
}
```

Get an API key from `cursor.com → Account → API Keys`.

### Models

- `composer-2` — recommended for code generation
- `composer-1.5` — legacy model

### Limitations

- Only available with a Cursor API key
- Model selection limited to Cursor models
- No per-step cost visibility (subscription-based)

---

## Pi SDK (30+ Providers)

The most flexible backend. Supports Anthropic, OpenAI, Google, Mistral, and 30+ other providers through a unified SDK.

### Configuration

```json
{
  "prism.backend": "pi",
  "prism.piProvider": "anthropic",
  "prism.piModel": "claude-sonnet-4-20250514",
  "prism.piApiKey": "sk-ant-..."
}
```

### Supported Providers

| Provider | `piProvider` value | Best For |
|----------|-------------------|----------|
| Anthropic | `anthropic` | Code generation, structured reasoning |
| OpenAI | `openai` | General-purpose tasks, embeddings |
| Google | `google` | Large context windows, Gemini models |
| Mistral | `mistral` | European data residency, fast inference |
| Groq | `groq` | Low-latency inference |
| Together AI | `together` | Open-source model access |
| Fireworks | `fireworks` | Fine-tuned model hosting |
| Cohere | `cohere` | Embeddings and RAG |
| Replicate | `replicate` | Custom model hosting |
| ... and 20+ more | | |

### Common Models by Provider

**Anthropic:**
- `claude-sonnet-4-20250514` — recommended for code generation
- `claude-opus-4-20250514` — complex reasoning tasks
- `claude-3.5-haiku-20241022` — fast, cost-effective

**OpenAI:**
- `gpt-4o-2024-11-20` — general-purpose
- `gpt-4o-mini-2024-07-18` — cost-effective

**Google:**
- `gemini-2.5-pro-exp-03-25` — large context
- `gemini-2.0-flash-001` — fast responses

### Switching Providers Per Step

You can override the provider and model per step in your pipeline YAML:

```yaml
steps:
  - id: plan
    agent: architect
    model: claude-opus-4-20250514   # Use Opus for planning

  - id: implement
    agent: executor
    model: gpt-4o-2024-11-20        # Use GPT-4o for code
```

---

## Anthropic Direct

Direct access to Claude models through the Anthropic API.

### Configuration

```json
{
  "prism.backend": "anthropic",
  "prism.apiKey": "sk-ant-..."
}
```

### Models

- `claude-sonnet-4-20250514`
- `claude-opus-4-20250514`
- `claude-3.5-haiku-20241022`

### When to Use

- You have an Anthropic API key and want direct access
- You need fine-grained control over Claude's parameters
- You don't need the orchestration features of Cursor SDK

---

## Configuration Reference

### Per-Step Overrides

All provider settings can be overridden per step in pipeline YAML:

```yaml
steps:
  - id: fast-step
    agent: critic
    model: claude-3.5-haiku-20241022
    max_tokens: 2000

  - id: heavy-step
    agent: architect
    model: claude-opus-4-20250514
    max_tokens: 32000
    thinking_level: high
```

### thinking Level

Available with Pi SDK. Controls the depth of reasoning:

- `low` — fast, surface-level analysis
- `medium` — balanced reasoning (default)
- `high` — deep analysis, suitable for architecture and planning

```yaml
steps:
  - id: design
    agent: architect
    thinking_level: high
```

---

## Security Notes

- All API keys are stored in VS Code's encrypted `SecretStorage` — not in plain text
- The `prism.allowedCommands` setting restricts which shell commands agents can run
- Use `prism.commandConfirmation` to require manual approval before any shell command
- The `prism.gates.autoApprove` setting should only be enabled in trusted environments
