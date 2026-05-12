import type { Model, Context, Tool, AssistantMessage } from '@earendil-works/pi-ai';
import {
  getModel as piGetModel,
  stream as piStream,
  complete as piComplete,
  getProviders,
  getModels,
} from '@earendil-works/pi-ai';

export interface LLMClientConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  sessionId?: string;
}

export function createLLMClient(config: LLMClientConfig = {}) {
  const {
    provider = 'anthropic',
    model = 'claude-sonnet-4-20250514',
    apiKey,
    thinkingLevel,
    sessionId,
  } = config;

  const modelInstance = piGetModel(provider as any, model as any);

  return {
    model: modelInstance,

    stream(context: Context, options?: Record<string, unknown>) {
      const streamOptions: any = {
        apiKey,
        sessionId,
        ...options,
      };

      if (thinkingLevel && modelInstance.reasoning) {
        streamOptions.reasoning = thinkingLevel;
      }

      return piStream(modelInstance, context, streamOptions);
    },

    async complete(context: Context, options?: Record<string, unknown>): Promise<AssistantMessage> {
      const streamOptions: any = {
        apiKey,
        sessionId,
        ...options,
      };

      if (thinkingLevel && modelInstance.reasoning) {
        streamOptions.reasoning = thinkingLevel;
      }

      return piComplete(modelInstance, context, streamOptions);
    },
  };
}

export function getModel(provider: string, model: string): Model<any> {
  return piGetModel(provider as any, model as any);
}

export function stream(model: Model<any>, context: Context, options?: Record<string, unknown>) {
  return piStream(model, context, options as any);
}

export function complete(model: Model<any>, context: Context, options?: Record<string, unknown>): Promise<AssistantMessage> {
  return piComplete(model, context, options as any);
}

export { getProviders, getModels };
