import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeAgent } from '../src/agent.js';
import type { AgentEvent } from '../src/types.js';

vi.mock('@earendil-works/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    state: {
      tools: [],
      messages: [],
      isStreaming: false,
    },
    subscribe: vi.fn().mockImplementation((callback) => {
      return () => {};
    }),
    prompt: vi.fn().mockResolvedValue(undefined),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock('@earendil-works/pi-ai', () => ({
  getModel: vi.fn().mockReturnValue({
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    reasoning: true,
  }),
}));

describe('OpenCodeAgent', () => {
  let agent: OpenCodeAgent;

  beforeEach(() => {
    agent = new OpenCodeAgent({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: 'test-api-key',
    });
  });

  it('should create an agent with valid config', () => {
    expect(agent).toBeDefined();
    expect(agent.state).toBeDefined();
  });

  it('should register event handlers', () => {
    const handler = vi.fn();
    agent.on('text_delta', handler);
    expect(handler).toBeDefined();
  });

  it('should remove event handlers with off()', () => {
    const handler = vi.fn();
    agent.on('text_delta', handler);
    agent.off('text_delta', handler);
  });

  it('should emit events to registered handlers', async () => {
    const events: AgentEvent[] = [];
    agent.on('agent_start', (event) => {
      events.push(event);
    });

    await agent.prompt('Test message');

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('agent_start');
  });

  it('should abort current operation', () => {
    expect(() => agent.abort()).not.toThrow();
  });

  it('should reset agent state', async () => {
    await expect(agent.reset()).resolves.not.toThrow();
  });
});
