# AIDLC + OpenCode Integration

AI Development Life Cycle (AIDLC) pipeline engine integrated with OpenCode/pi SDK for multi-provider AI agent support.

## Features

- **Multi-Backend Support**: Run pipeline steps using Cursor SDK, Pi SDK, or Anthropic
- **30+ LLM Providers**: Access Anthropic, OpenAI, Google, Mistral, Groq, and more via pi-ai
- **Standalone SDK**: `@opencode-go/sdk` package for reuse in other projects
- **Human-in-the-Loop**: Approve/reject each pipeline step
- **Artifact-Driven**: Markdown artifacts as source of truth
- **Per-Step Backend Selection**: Mix and match backends in a single pipeline

## Project Structure

```
packages/
  opencode-sdk/        # @opencode-go/sdk - wraps pi-ai + pi-agent-core
    src/
      index.ts         # Public API exports
      agent.ts         # OpenCodeAgent wrapper
      llm.ts           # LLM client utilities
      tools.ts         # Tool definitions
      types.ts         # TypeScript types
    README.md          # SDK documentation

aidlc/                 # AIDLC VS Code extension with pi integration
  src/
    engine/
      runner/
        step-runner.ts       # Cursor SDK + Anthropic runners
        pi-sdk-runner.ts     # NEW: Pi SDK runner
    extension/
      engine-bridge.ts       # Updated: multi-backend support
    extension.ts             # Updated: backend configuration
    panel/
      components/
        SettingsPage.tsx     # Updated: backend selection UI
```

## Quick Start

### Install Dependencies

```bash
npm install
```

### Build

```bash
# Build SDK first
npm run build --workspace=@opencode-go/sdk

# Build AIDLC extension
npm run build --workspace=aidlc
```

### Development

```bash
npm run dev --workspace=aidlc
```

### Package

```bash
npm run package --workspace=aidlc
```

## Configuration

### VS Code Settings

```json
{
  "aidlc.backend": "pi",
  "aidlc.piProvider": "anthropic",
  "aidlc.piModel": "claude-sonnet-4-20250514",
  "aidlc.piApiKey": "sk-ant-...",
  "aidlc.apiKey": "key_..."
}
```

### Backend Options

- `cursor`: Cursor SDK (default, uses composer-2 model)
- `pi`: Pi SDK (supports 30+ providers via pi-ai)
- `anthropic`: Anthropic API (direct Claude access)

### Supported Pi Providers

- **anthropic**: Claude Sonnet, Opus, Haiku
- **openai**: GPT-4, GPT-5, o1, o3
- **google**: Gemini 2.5 Flash/Pro
- **mistral**: Mistral Large/Small
- **groq**: Llama, Mixtral, Gemma
- **cerebras**: Llama, Mixtral
- **xai**: Grok
- **openrouter**: 100+ models
- **Together AI**: Various open models
- And more...

## Using @opencode-go/sdk

See [packages/opencode-sdk/README.md](packages/opencode-sdk/README.md) for full SDK documentation.

### Basic Example

```typescript
import { OpenCodeAgent, createLLMClient } from '@opencode-go/sdk';

// LLM Client
const client = createLLMClient({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Agent
const agent = new OpenCodeAgent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  thinkingLevel: 'high',
});

agent.on('text_delta', (event) => {
  console.log(event.delta);
});

await agent.prompt('Build me a web app');
```

## Architecture

### Multi-Backend Runner System

AIDLC now supports three backend runners:

1. **CursorSdkStepRunner**: Uses @cursor/sdk (original backend)
2. **PiSdkStepRunner**: Uses @opencode-go/sdk wrapping pi-ai + pi-agent-core
3. **AnthropicStepRunner**: Uses @anthropic-ai/sdk directly

The `EngineBridge` creates the appropriate runner based on configuration:

```typescript
// engine-bridge.ts
private createRunner(backend: "cursor" | "pi" | "anthropic"): StepRunner {
  switch (backend) {
    case "pi":
      return new PiSdkStepRunner({
        apiKey: this._piApiKey,
        provider: this._piProvider,
        model: this._piModel,
      });
    case "anthropic":
      return new AnthropicStepRunner(this._apiKey);
    case "cursor":
    default:
      return new CursorSdkStepRunner(this._apiKey);
  }
}
```

### Event Flow

```
Pipeline Step
  ↓
EngineBridge.createRunner(backend)
  ↓
StepRunner.run(step, context, opts)
  ↓
Agent Execution (Cursor/Pi/Anthropic)
  ↓
Stream Events → onEvent callback
  ↓
Panel UI (AgentStream, StepCard)
```

## Pipeline Example

```yaml
name: multi-backend-pipeline
version: "1.0"
steps:
  - id: design
    name: Design
    agent: architect
    artifact: design.md
    backend: pi  # Use Pi SDK
    model: claude-sonnet-4-20250514
    
  - id: implement
    name: Implement
    agent: executor
    artifact: code.md
    depends_on: [design]
    backend: cursor  # Use Cursor SDK
    tags: [code, build]
    
  - id: review
    name: Review
    agent: critic
    artifact: review.md
    depends_on: [implement]
    backend: anthropic  # Use Anthropic directly
```

## Development

### Adding a New Provider

The SDK already supports 30+ providers via pi-ai. To use a new provider:

1. Set `aidlc.backend` to `pi`
2. Set `aidlc.piProvider` to the provider ID
3. Set `aidlc.piModel` to the model ID
4. Set `aidlc.piApiKey` to your API key

Provider IDs: `anthropic`, `openai`, `google`, `mistral`, `groq`, `cerebras`, `xai`, `openrouter`, etc.

### Building the SDK

```bash
cd packages/opencode-sdk
npm run build
```

### Testing

```bash
npm test
```

## License

MIT

## Contributing

Contributions welcome! Please read the existing codebase to understand the architecture before making changes.
