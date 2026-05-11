# PRISM SDK

Unified LLM and Agent runtime SDK wrapping pi-ai and pi-agent-core. Provides a simplified API for working with 30+ AI providers.

## Installation

```bash
npm install @prism/sdk
```

## Quick Start

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
  messages: [{ role: 'user', content: 'Hello!' }]
};

// Streaming
const stream = client.stream(context);
for await (const event of stream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

// Or complete in one call
const response = await client.complete(context);
console.log(response.content);
```

### Agent Runtime

```typescript
import { OpenCodeAgent } from '@prism/sdk';

const agent = new OpenCodeAgent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  systemPrompt: 'You are a helpful coding assistant.',
  thinkingLevel: 'high',
});

// Listen to events
agent.on('text_delta', (event) => {
  process.stdout.write(event.delta);
});

agent.on('tool_call_start', (event) => {
  console.log(`Tool: ${event.toolName}`);
});

// Run the agent
const result = await agent.prompt('Create a hello world app');
```

## Supported Providers

- anthropic (Claude)
- openai (GPT-4, GPT-5, etc.)
- google (Gemini)
- mistral
- groq
- cerebras
- xai (Grok)
- openrouter
- Together AI
- And 20+ more...

## API Reference

### createLLMClient(config)

Creates a unified LLM client.

**Config:**
- `provider`: Provider ID (anthropic, openai, google, etc.)
- `model`: Model ID
- `apiKey`: API key (optional, can use env vars)
- `thinkingLevel`: Thinking level for reasoning models
- `sessionId`: Session ID for caching

**Methods:**
- `stream(context, options)`: Stream responses
- `complete(context, options)`: Get complete response

### OpenCodeAgent

Agent runtime with tool support.

**Constructor:**
```typescript
new OpenCodeAgent({
  provider,
  model,
  apiKey,
  systemPrompt,
  tools,
  thinkingLevel,
})
```

**Methods:**
- `prompt(message, attachments)`: Run the agent
- `stream(message)`: Stream agent responses
- `abort()`: Cancel current operation
- `reset()`: Clear agent state

**Events:**
- `agent_start`: Agent started
- `agent_end`: Agent finished
- `agent_error`: Error occurred
- `text_delta`: Text chunk received
- `thinking_start/thinking_delta`: Thinking content
- `tool_call_start/tool_call_end`: Tool execution

## License

MIT
