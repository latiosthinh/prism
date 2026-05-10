# AIDLC + OpenCode Integration

AI Development Life Cycle (AIDLC) pipeline engine integrated with OpenCode/pi SDK for multi-provider AI agent support.

## Features

- **Multi-Backend Support**: Run pipeline steps using Cursor SDK, Pi SDK, or Anthropic
- **30+ LLM Providers**: Access Anthropic, OpenAI, Google, and more via pi-ai
- **Standalone SDK**: `@opencode-go/sdk` package for reuse in other projects
- **Human-in-the-Loop**: Approve/reject each pipeline step
- **Artifact-Driven**: Markdown artifacts as source of truth

## Project Structure

```
packages/
  opencode-sdk/        # @opencode-go/sdk - wraps pi-ai + pi-agent-core
aidlc/                 # AIDLC VS Code extension with pi integration
```

## Quick Start

```bash
npm install
npm run build
```

## License

MIT
