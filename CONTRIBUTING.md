# Contributing to PRISM

Thanks for your interest in contributing! PRISM is a VS Code extension built with TypeScript, React, and multiple AI provider SDKs.

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- VS Code 1.85+

### Getting Started

```bash
# Clone the repo
git clone https://github.com/latiosthinh/prism.git
cd prism

# Install dependencies
npm install

# Build all packages
npm run build -w prism
```

### Monorepo Structure

```
prism/
├── packages/
│   └── prism-sdk/       # @prism/sdk — Agent SDK for building custom agents
└── prism/               # VS Code extension — engine, panel UI, templates
    ├── src/
    │   ├── extension.ts          # Extension activation and command handlers
    │   ├── extension/
    │   │   ├── engine-bridge.ts  # Bridge between panel UI and engine
    │   │   └── templates/        # Pipeline YAML templates
    │   ├── engine/
    │   │   ├── pipeline/         # Schema, loader, validator
    │   │   ├── orchestrator/     # State machine, loop orchestrator
    │   │   ├── runner/           # Step runners (Cursor, Anthropic, Pi SDK)
    │   │   ├── agents/           # Agent registry and built-in agent prompts
    │   │   └── artifacts/        # Skill loader
    │   └── panel/                # React webview UI
    └── tests/
```

### Development Commands

```bash
npm run dev -w prism    # Watch mode: extension + panel rebuild on change
npm run build -w prism  # Build extension and panel
npm run lint -w prism   # Lint all source files
npm test -w prism       # Run tests
```

## How to Add a New Agent

1. Add the agent prompt to `prism/src/engine/agents/builtins.ts`
2. Rebuild: `npm run build -w prism`

Agents are referenced by name in pipeline YAML:

```yaml
steps:
  - id: my-step
    agent: my-custom-agent
```

## How to Add a New Pipeline Template

1. Create a new `.yaml` file in `prism/src/extension/templates/`
2. Import and register it in `prism/src/extension/templates/index.ts`
3. Rebuild: `npm run build -w prism`

## How to Add a New Step Runner

1. Implement `StepRunner` interface from `prism/src/engine/runner/step-runner.ts`
2. Register in `EngineBridge.createRunner()` in `engine-bridge.ts`

## Coding Conventions

- **TypeScript strict mode** — all code must compile with `strict: true`
- **No default exports** — always use named exports
- **Prefer interfaces over type aliases** for public APIs
- **Zod for schema validation** — pipeline schema, step definitions
- **Write tests** — new features should have test coverage
- **Follow existing patterns** — look at neighboring files for conventions

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes with tests
3. Run `npm run lint -w prism && npm test -w prism` to verify
4. Submit a PR against `master`
5. CI must pass (lint, test, build)

## Getting Help

- [Discord](https://discord.gg/prism) — real-time discussion
- [GitHub Discussions](https://github.com/latiosthinh/prism/discussions) — ideas and questions
- [Issues](https://github.com/latiosthinh/prism/issues) — bugs and feature requests
