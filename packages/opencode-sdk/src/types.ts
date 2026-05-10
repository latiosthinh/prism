export interface OpenCodeAgentConfig {
  provider: string;
  model: string;
  apiKey?: string;
  tools?: any[];
  systemPrompt?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface OpenCodeAgentResult {
  message: any;
  duration: number;
  usage: {
    input: number;
    output: number;
    cost: { total: number };
  };
}

export interface OpenCodeAgentStream {
  [Symbol.asyncIterator](): AsyncIterator<AgentEvent>;
}

export interface OpenCodeToolConfig {
  name: string;
  description: string;
  parameters: any;
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    details?: Record<string, unknown>;
  }>;
}

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

export type AgentEvent =
  | { type: 'agent_start'; timestamp: string }
  | { type: 'agent_end'; result?: OpenCodeAgentResult; timestamp: string }
  | { type: 'agent_error'; error: string; timestamp: string }
  | { type: 'text_delta'; delta: string; timestamp: string }
  | { type: 'thinking_start'; timestamp: string }
  | { type: 'thinking_delta'; delta: string; timestamp: string }
  | { type: 'tool_call_start'; toolName: string; args: Record<string, unknown>; timestamp: string }
  | { type: 'tool_call_end'; toolName: string; result: any; timestamp: string }
  | { type: 'unknown'; raw: any; timestamp: string };
