import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PiSdkStepRunner } from '../src/engine/runner/pi-sdk-runner.js';
import type { StepDefinition, AgentContext, AgentEvent } from '../src/engine/pipeline/schema.js';

vi.mock('@prism/sdk', () => ({
  OpenCodeAgent: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('PiSdkStepRunner', () => {
  let runner: PiSdkStepRunner;
  let tempDir: string;

  beforeEach(() => {
    runner = new PiSdkStepRunner({
      apiKey: 'test-api-key',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });
    tempDir = path.join(__dirname, 'temp-test-dir');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create a runner with valid config', () => {
    expect(runner).toBeDefined();
  });

  it('should throw error if API key is missing', async () => {
    const runnerNoKey = new PiSdkStepRunner({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    });

    const step: StepDefinition = {
      id: 'test-step',
      name: 'Test Step',
      agent: 'test-agent',
      model: 'claude-sonnet-4-20250514',
      gate: true,
      maxRetries: 3,
      artifact: 'output.md',
      depends_on: [],
      tags: [],
      skills: [],
    };

    const context: AgentContext = {
      cwd: tempDir,
      idea: 'Test idea',
      artifacts: {},
    };

    const events: AgentEvent[] = [];
    const onEvent = (event: AgentEvent) => events.push(event);

    await expect(
      runnerNoKey.run(step, context, { cwd: tempDir, onEvent })
    ).rejects.toThrow('Pi SDK requires prism.piApiKey');
  });

  it('should emit progress events during run', async () => {
    const step: StepDefinition = {
      id: 'test-step',
      name: 'Test Step',
      agent: 'test-agent',
      model: 'claude-sonnet-4-20250514',
      gate: true,
      maxRetries: 3,
      artifact: 'output.md',
      depends_on: [],
      tags: [],
      skills: [],
    };

    const context: AgentContext = {
      cwd: tempDir,
      idea: 'Test idea',
      artifacts: {},
    };

    const events: AgentEvent[] = [];
    const onEvent = (event: AgentEvent) => events.push(event);

    await runner.run(step, context, { cwd: tempDir, onEvent });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'progress')).toBe(true);
  });

  it('should build prompt with context', async () => {
    const step: StepDefinition = {
      id: 'test-step',
      name: 'Test Step',
      agent: 'test-agent',
      model: 'claude-sonnet-4-20250514',
      gate: true,
      maxRetries: 3,
      artifact: 'output.md',
      depends_on: [],
      tags: ['code', 'build'],
      skills: [],
    };

    const context: AgentContext = {
      cwd: tempDir,
      idea: 'Test idea',
      artifacts: {
        'system-prompt': { body: 'You are a helpful assistant.' },
        'design': { body: '# Design Document\n\nThis is the design.' },
      },
    };

    const events: AgentEvent[] = [];
    const onEvent = (event: AgentEvent) => {
      if (event.type === 'prompt') {
        expect(event.content).toContain('Test idea');
        expect(event.content).toContain('Test Step');
        expect(event.content).toContain('# Design Document');
      }
      events.push(event);
    };

    await runner.run(step, context, { cwd: tempDir, onEvent });
  });
});
