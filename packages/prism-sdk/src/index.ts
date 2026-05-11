export type {
  OpenCodeAgentConfig,
  OpenCodeAgentResult,
  OpenCodeAgentStream,
  OpenCodeToolConfig,
  EventHandler,
  AgentEvent,
} from './types.js';

export { OpenCodeAgent } from './agent.js';
export { createLLMClient, getModel, stream, complete } from './llm.js';
export { createTool, validateToolCall } from './tools.js';

export type {
  Context,
  Tool,
  AssistantMessage,
  UserMessage,
  ToolResultMessage,
  Message,
  StreamEvent,
  Model,
} from '@earendil-works/pi-ai';

export type {
  AgentTool,
  AgentMessage,
  AgentState,
} from '@earendil-works/pi-agent-core';

export { buildCodebaseContext } from './context-builder.js';
export type { FileContext, CodebaseContext } from './context-builder.js';

export { McpClientManager, parseMcpServersFromPipeline } from './mcp-client.js';
export type { McpServerConfig, McpTool, McpResource, McpToolCallResult } from './mcp-client.js';
