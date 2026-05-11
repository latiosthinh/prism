import type { Tool, AssistantMessage } from '@earendil-works/pi-ai';
import { validateToolCall as piValidateToolCall } from '@earendil-works/pi-ai';

export interface OpenCodeToolConfig {
  name: string;
  description: string;
  parameters: any;
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    details?: Record<string, unknown>;
  }>;
}

export function createTool(config: OpenCodeToolConfig): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
  };
}

export function validateToolCall(tools: Tool[], toolCall: AssistantMessage['content'][number] & { type: 'toolCall' }) {
  return piValidateToolCall(tools, toolCall as any);
}
