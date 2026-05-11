# PRISM

> **Refract ideas into working software through AI pipelines.**

PRISM is a multi-provider AI development orchestration engine that transforms raw ideas into production-ready code through structured, gated pipelines. It connects 30+ AI providers into a unified system where every step is reviewable, every decision is logged, and every artifact is source-controlled.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()
[![Providers](https://img.shields.io/badge/providers-30+-purple)]()

---

## ✨ What Makes PRISM Different

**Most AI tools give you a chat.** PRISM gives you a **pipeline** — a structured, auditable, replayable SDLC that runs through specialized AI agents.

| Feature | Traditional AI Tools | PRISM |
|---------|---------------------|-------|
| Workflow | Freeform chat | Structured DAG pipeline |
| Providers | Single backend | 30+ providers simultaneously |
| Review | Manual | Human-in-the-loop gates |
| Artifacts | Lost in chat | Markdown files, git-tracked |
| Reproducibility | None | Replay any run, resume from any step |
| Audit Trail | None | Append-only decision log |

---

## 🎯 Core Concepts

### Pipeline as Code

Define your AI workflow as YAML. Each step is a specialized agent with dependencies, gates, and retry logic.

```yaml
name: feature-build
steps:
  - id: design
    agent: architect
    backend: pi
    provider: anthropic
    model: claude-sonnet-4-20250514
    
  - id: implement
    agent: executor
    backend: cursor
    depends_on: [design]
    
  - id: review
    agent: critic
    backend: anthropic
    depends_on: [implement]
    gate: true
```

### Multi-Backend Architecture

Run different steps with different AI providers. Mix Cursor SDK, Pi SDK (30+ providers), and direct Anthropic API in a single pipeline.

```
┌─────────────────────────────────────────────────────────┐
│                    PRISM Pipeline                        │
│                                                          │
│  Step 1: Design ──→ Step 2: Implement ──→ Step 3: Review│
│     (Pi SDK)           (Cursor SDK)         (Anthropic)  │
│     Anthropic          composer-2           Claude Opus  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Artifact-Driven Development

Every agent writes to Markdown files. Code goes in source files. Artifacts are the source of truth — diffable, reviewable, and git-friendly.

```
.aidlc/runs/<run-id>/
├── state.json              # Full run state
├── artifacts/              # Agent outputs
│   ├── design.md
│   ├── tasks.md
│   └── review.md
└── decisions/              # Append-only audit trail
    └── decisions.jsonl
```

---

## 🚀 Quick Start

### Install

```bash
git clone https://github.com/your-org/prism.git
cd prism
npm install
npm run build
```

### Configure

Set your AI provider in VS Code settings:

```json
{
  "prism.backend": "pi",
  "prism.piProvider": "anthropic",
  "prism.piModel": "claude-sonnet-4-20250514",
  "prism.piApiKey": "sk-ant-..."
}
```

### Run

1. Open Command Palette → `PRISM: Open Pipeline`
2. Select a template or create custom
3. Enter your idea
4. Watch the pipeline execute step-by-step
5. Approve or reject each gated step

---

## 🏗️ Architecture

### Three-Layer Design

```
┌──────────────────────────────────────────────────────┐
│                  VS Code Extension                    │
│  ┌────────────────────────────────────────────────┐  │
│  │              React Panel UI                     │  │
│  │  DAG Canvas • Live Stream • Decision Log       │  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │              Engine Bridge                      │  │
│  │  Pipeline Loader • State Machine • Orchestrator│  │
│  └────────────────────────────────────────────────┘  │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐  │
│  │              Step Runners                       │  │
│  │  ┌──────────┬──────────┬────────────────────┐  │  │
│  │  │ Cursor   │   Pi     │   Anthropic        │  │  │
│  │  │ SDK      │   SDK    │   SDK              │  │  │
│  │  └──────────┴──────────┴────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/
  prism-sdk/              # @prism/sdk - Unified AI runtime
    src/
      agent.ts            # OpenCodeAgent with event streaming
      llm.ts              # Multi-provider LLM client
      tools.ts            # Tool definitions & validation
      types.ts            # TypeScript interfaces

prism/                    # VS Code Extension
  src/
    engine/
      pipeline/           # YAML schema, loader, validator
      orchestrator/       # State machine, loop orchestration
      runner/
        step-runner.ts    # Cursor + Anthropic runners
        pi-sdk-runner.ts  # Pi SDK runner with tool execution
      agents/             # 12 built-in AI agents
    extension/
      engine-bridge.ts    # Multi-backend factory
      templates/          # Pipeline YAML templates
    panel/                # React UI components
```

---

## 🤖 Built-In Agents

PRISM ships with 12 specialized AI agents:

| Agent | Role | Category |
|-------|------|----------|
| `idea-expander` | Turns raw ideas into product specs | Product |
| `requirements-engineer` | Testable functional requirements | Product |
| `architect` | System design, components, data flow | Technical |
| `task-generator` | Decomposes design into atomic tasks | Technical |
| `executor` | Implements tasks surgically | Technical |
| `critic` | Code review for correctness | Quality |
| `test-writer` | Test specifications | Quality |
| `reporter` | Final run summary | Product |
| `security-reviewer` | OWASP/STRIDE audit | Quality |
| `performance-reviewer` | Performance profiling | Quality |
| `docs-writer` | Documentation from code | Product |
| `migration-planner` | Safe, reversible migrations | Technical |

---

## 🌐 Supported Providers

Via PRISM SDK (wrapping pi-ai):

### Tier 1 — Full Support
- **Anthropic** — Claude Sonnet 4, Opus, Haiku
- **OpenAI** — GPT-4, GPT-5, o1, o3, Codex
- **Google** — Gemini 2.5 Flash/Pro

### Tier 2 — Production Ready
- **Mistral** — Mistral Large/Small
- **Groq** — Llama, Mixtral, Gemma
- **Cerebras** — Llama, Mixtral
- **xAI** — Grok
- **OpenRouter** — 100+ models
- **Together AI** — Various open models

### Tier 3 — Community Supported
- **DeepSeek**, **Cloudflare AI**, **MiniMax**, **Fireworks**, **GitHub Copilot**, **Amazon Bedrock**, **Vercel AI Gateway**, **ZAI**, **Kimi For Coding**, **Xiaomi MiMo**

---

## 📋 Pipeline Templates

PRISM includes 8 pre-built templates:

| Template | Use Case | Steps |
|----------|----------|-------|
| `default` | Full SDLC | 8 steps with loops |
| `feature-build` | Quick features | Design → Implement → Test |
| `code-review` | Audit code | Review → Report |
| `bug-fix` | Fix bugs | Investigate → Fix → Verify |
| `full-stack-feature` | End-to-end | 6 steps with security |
| `refactor` | Safe refactoring | Analyze → Plan → Refactor → Verify |
| `prd-to-prototype` | Idea to code | Brainstorm → Prototype |
| `blank` | Custom | Start from scratch |

---

## 🔧 Configuration

### VS Code Settings

```json
{
  "prism.backend": "pi",
  "prism.piProvider": "anthropic",
  "prism.piModel": "claude-sonnet-4-20250514",
  "prism.piApiKey": "sk-ant-...",
  "prism.apiKey": "key_...",
  "prism.model": "claude-sonnet-4-20250514",
  "prism.maxTokens": 8192,
  "prism.autoApproveYolo": false,
  "prism.commandConfirmation": true,
  "prism.allowedCommands": ["ls", "cat", "grep", "find"]
}
```

### Per-Step Backend Override

```yaml
steps:
  - id: design
    backend: pi
    provider: openai
    model: gpt-4o
    
  - id: implement
    backend: cursor
    
  - id: security-review
    backend: anthropic
```

---

## 🧪 Using PRISM SDK

### LLM Client

```typescript
import { createLLMClient } from '@prism/sdk';

const client = createLLMClient({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  thinkingLevel: 'medium',
});

const context = {
  messages: [{ role: 'user', content: 'Design a REST API' }]
};

// Streaming
const stream = client.stream(context);
for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}
```

### Agent Runtime

```typescript
import { OpenCodeAgent } from '@prism/sdk';

const agent = new OpenCodeAgent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You are a senior software architect.',
  thinkingLevel: 'high',
});

// Real-time streaming
for await (const event of agent.stream('Build a web app')) {
  if (event.type === 'text_delta') {
    console.log(event.delta);
  }
  if (event.type === 'tool_call_start') {
    console.log(`Using ${event.toolName}...`);
  }
}
```

---

## 📊 Project Structure

```
prism/
├── packages/
│   └── prism-sdk/              # @prism/sdk
│       ├── src/
│       │   ├── agent.ts        # OpenCodeAgent
│       │   ├── llm.ts          # LLM client
│       │   ├── tools.ts        # Tool framework
│       │   └── types.ts        # TypeScript types
│       ├── tests/
│       │   ├── agent.test.ts
│       │   └── llm.test.ts
│       └── package.json
│
├── prism/                      # VS Code Extension
│   ├── src/
│   │   ├── engine/
│   │   │   ├── pipeline/       # Schema, loader, validator
│   │   │   ├── orchestrator/   # State machine, loops
│   │   │   ├── runner/         # Step runners
│   │   │   └── agents/         # Built-in agents
│   │   ├── extension/
│   │   │   ├── engine-bridge.ts
│   │   │   └── templates/      # YAML templates
│   │   └── panel/              # React UI
│   ├── tests/
│   │   └── pi-sdk-runner.test.ts
│   └── package.json
│
├── .planning/                  # Project planning
│   ├── ROADMAP.md
│   ├── PROJECT.md
│   └── STATE.md
│
└── README.md
```

---

## 🛠️ Development

### Build

```bash
# Build SDK
npm run build --workspace=@prism/sdk

# Build extension
npm run build --workspace=prism

# Or build everything
npm run build
```

### Test

```bash
npm test --workspace=@prism/sdk
npm test --workspace=prism
```

### Dev Mode

```bash
npm run dev --workspace=prism
```

---

## 📜 Git History

Clean, atomic commits:

```
0e846d6 fix 4: add unit tests for OpenCodeAgent, LLM client, and PiSdkStepRunner
f521839 fix 5: extract YAML templates from engine-bridge.ts to separate files
318e7b4 fix 8: add .prism/ to .gitignore by default
97cfb49 fix 7: add actual execute handlers to tools in pi-sdk-runner.ts
5f60fa1 fix 3+6: make OpenCodeAgent.stream() truly streaming + fix getApiKey fallback
354b383 fix 2: replace (this as any) casts with mutable internal properties
ef512b1 fix 1: update writePrismSettings to include backend fields
c6939f2 final: update ROADMAP and STATE with completion summary
7c20770 phase 5: create comprehensive documentation
4dbcf18 phase 4 part 3: add backend selection UI
b42c64e phase 4 part 2: update extension.ts
35f23d0 phase 4 part 1: update package.json
429405f phase 3: create PiSdkStepRunner and EngineBridge
f62f618 phase 2: create @prism/sdk package
0015142 init: project structure and planning docs
```

---

## 🎯 Why PRISM?

1. **Multi-Provider** — Don't lock into one AI. Use the best model for each step.
2. **Structured** — No more lost context in chat. Every step produces artifacts.
3. **Auditable** — Every decision logged, every artifact tracked in git.
4. **Reproducible** — Replay any run. Resume from any step.
5. **Extensible** — Custom agents, custom skills, custom pipelines.
6. **Open** — MIT licensed. No vendor lock-in. 30+ providers.

---

## 📄 License

MIT

---

## 🤝 Contributing

PRISM is open source and welcomes contributions. See our [Contributing Guide](CONTRIBUTING.md) for details.

---

> *"The best way to predict the future is to build it."* — PRISM refracts your ideas into reality.
