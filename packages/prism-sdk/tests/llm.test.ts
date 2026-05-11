import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMClient, getModel } from '../src/llm.js';

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn().mockReturnValue({
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    reasoning: true,
  }),
  stream: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'text_delta', delta: 'Hello' };
      yield { type: 'done', reason: 'stop' };
    },
    result: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Hello' }],
      stopReason: 'stop',
    }),
  }),
  complete: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Hello' }],
    stopReason: 'stop',
  }),
  getProviders: vi.fn().mockReturnValue(['anthropic', 'openai', 'google']),
  getModels: vi.fn().mockReturnValue([{ id: 'claude-sonnet-4-20250514' }]),
}));

describe('LLM Client', () => {
  it('should create a client with default config', () => {
    const client = createLLMClient();
    expect(client).toBeDefined();
    expect(client.model).toBeDefined();
  });

  it('should create a client with custom config', () => {
    const client = createLLMClient({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'test-key',
      thinkingLevel: 'high',
    });
    expect(client).toBeDefined();
  });

  it('should getModel with provider and model', () => {
    const model = getModel('anthropic', 'claude-sonnet-4-20250514');
    expect(model).toBeDefined();
  });
});
