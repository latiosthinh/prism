import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, AgentTool, AgentState } from '@earendil-works/pi-agent-core';
import type { Context, Tool, AssistantMessage } from '@earendil-works/pi-ai';
import { getModel } from '@earendil-works/pi-ai';
import type { OpenCodeAgentConfig, OpenCodeAgentResult, EventHandler, AgentEvent } from './types.js';

export class OpenCodeAgent {
  private agent: Agent;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private config: OpenCodeAgentConfig;

  constructor(config: OpenCodeAgentConfig) {
    this.config = config;

    const model = getModel(config.provider as any, config.model as any);

    const initialState: Partial<AgentState> = {
      systemPrompt: config.systemPrompt || 'You are a helpful coding assistant.',
      model,
    };

    if (config.thinkingLevel) {
      (initialState as any).thinkingLevel = config.thinkingLevel;
    }

    this.agent = new Agent({
      initialState: initialState as any,
      convertToLlm: (messages: AgentMessage[]) => {
        return messages.filter((m) => {
          const role = (m as any).role;
          return role === 'user' || role === 'assistant' || role === 'toolResult';
        });
      },
      getApiKey: async (provider: string) => {
        return config.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || undefined;
      },
    });

    if (config.tools && config.tools.length > 0) {
      this.agent.state.tools = config.tools as unknown as AgentTool<any>[];
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: AgentEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  async prompt(message: string, attachments?: Array<{ type: string; data: string; mimeType?: string }>): Promise<OpenCodeAgentResult> {
    const startTime = Date.now();
    const content: any[] = [{ type: 'text', text: message }];

    if (attachments) {
      content.push(...attachments);
    }

    this.emit({ type: 'agent_start', timestamp: new Date().toISOString() });

    const unsubscribe = this.agent.subscribe(async (event: any) => {
      this.emit(this.mapAgentEvent(event));
    });

    try {
      await this.agent.prompt({
        role: 'user',
        content,
        timestamp: Date.now(),
      } as AgentMessage);

      await this.agent.waitForIdle();

      const lastMessage = this.agent.state.messages[this.agent.state.messages.length - 1];
      const duration = Date.now() - startTime;

      let inputTokens = 0;
      let outputTokens = 0;

      const lastMsg = lastMessage as any;
      if (lastMsg?.usage) {
        inputTokens = lastMsg.usage.input_tokens ?? lastMsg.usage.prompt_tokens ?? 0;
        outputTokens = lastMsg.usage.output_tokens ?? lastMsg.usage.completion_tokens ?? 0;
      }

      if (lastMsg?.meta?.tokens) {
        inputTokens = inputTokens || (lastMsg.meta.tokens.input ?? lastMsg.meta.tokens.prompt ?? 0);
        outputTokens = outputTokens || (lastMsg.meta.tokens.output ?? lastMsg.meta.tokens.completion ?? 0);
      }

      const costPerMillion = this.config.provider === "anthropic" ? 15.0 : 3.0;
      const totalCost = (inputTokens + outputTokens) * costPerMillion / 1_000_000;

      const result: OpenCodeAgentResult = {
        message: lastMessage as unknown as AssistantMessage,
        duration,
        usage: {
          input: inputTokens,
          output: outputTokens,
          cost: { total: totalCost },
        },
      };

      this.emit({
        type: 'agent_end',
        result,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error: any) {
      this.emit({
        type: 'agent_error',
        error: error.message || String(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    } finally {
      unsubscribe();
    }
  }

  async *stream(message: string): AsyncIterable<AgentEvent> {
    const queue: AgentEvent[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveNext: (() => void) | null = null;

    const unsubscribe = this.agent.subscribe(async (event: any) => {
      const mappedEvent = this.mapAgentEvent(event);
      queue.push(mappedEvent);
      this.emit(mappedEvent);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    const promptPromise = this.agent.prompt({
      role: 'user',
      content: [{ type: 'text', text: message }],
      timestamp: Date.now(),
    } as AgentMessage).then(async () => {
      await this.agent.waitForIdle();
    }).catch((err: any) => {
      error = err;
    }).finally(() => {
      done = true;
      unsubscribe();
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    try {
      while (!done || queue.length > 0) {
        if (queue.length === 0 && !done) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }

        while (queue.length > 0) {
          yield queue.shift()!;
        }

        if (error) {
          throw error;
        }
      }
    } finally {
      await promptPromise;
    }
  }

  abort(): void {
    this.agent.abort();
  }

  async reset(): Promise<void> {
    this.agent.reset();
  }

  get state(): AgentState {
    return this.agent.state;
  }

  private mapAgentEvent(event: any): AgentEvent {
    const baseEvent = {
      timestamp: new Date().toISOString(),
    };

    switch (event.type) {
      case 'agent_start':
        return { ...baseEvent, type: 'agent_start' as const };
      case 'agent_end':
        return { ...baseEvent, type: 'agent_end' as const };
      case 'message_update':
        return {
          ...baseEvent,
          type: 'text_delta' as const,
          delta: event.assistantMessageEvent?.delta || '',
        };
      case 'tool_execution_start':
        return {
          ...baseEvent,
          type: 'tool_call_start' as const,
          toolName: event.toolName || '',
          args: event.args || {},
        };
      case 'tool_execution_end':
        return {
          ...baseEvent,
          type: 'tool_call_end' as const,
          toolName: event.toolName || '',
          result: event.result || '',
        };
      case 'thinking_start':
        return { ...baseEvent, type: 'thinking_start' as const };
      case 'thinking_delta':
        return {
          ...baseEvent,
          type: 'thinking_delta' as const,
          delta: event.delta || '',
        };
      default:
        return { ...baseEvent, type: 'unknown' as const, raw: event };
    }
  }
}
