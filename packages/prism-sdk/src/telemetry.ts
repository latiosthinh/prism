export type TelemetryStatus = "running" | "done" | "failed" | "skipped";

export interface StepTelemetry {
  stepId: string;
  agent: string;
  provider: string;
  model: string;
  startedAt: number;
  completedAt?: number;
  tokensIn: number;
  tokensOut: number;
  tokensCachedIn: number;
  costUsd: number;
  status: TelemetryStatus;
  durationMs: number;
}

export interface RunTelemetry {
  runId: string;
  pipeline: string;
  budgetUsd: number;
  startedAt: number;
  completedAt?: number;
  steps: StepTelemetry[];
  status: "running" | "completed" | "failed" | "aborted" | "cancelled";
}

export interface CostRate {
  input: number;
  output: number;
  cached?: number;
}

const COST_TABLE: Record<string, CostRate> = {
  "claude-opus-4-20250514": { input: 15.0, output: 75.0, cached: 1.5 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0, cached: 0.3 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0, cached: 0.3 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "gpt-4o-2024-11-20": { input: 2.5, output: 10.0 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6 },
  "gpt-4-turbo-2024-04-09": { input: 10.0, output: 30.0 },
  "gemini-2.5-pro-exp-03-25": { input: 1.25, output: 10.0 },
  "gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "composer-2": { input: 0.0, output: 0.0 },
  "composer-1.5": { input: 0.0, output: 0.0 },
  unknown: { input: 0, output: 0 },
};

export function getRate(model: string): CostRate {
  return COST_TABLE[model] ?? COST_TABLE["unknown"];
}

export function updateRate(model: string, rates: CostRate): void {
  COST_TABLE[model] = rates;
}

export function computeCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  tokensCachedIn = 0,
): number {
  const rate = getRate(model);
  const normalIn = tokensIn - tokensCachedIn;
  const cachedCost = tokensCachedIn * (rate.cached ?? rate.input * 0.1) / 1_000_000;
  const normalCost = normalIn * rate.input / 1_000_000;
  const outCost = tokensOut * rate.output / 1_000_000;
  return cachedCost + normalCost + outCost;
}

export function extractUsage(
  provider: string,
  response: any,
): { tokensIn: number; tokensOut: number; tokensCachedIn: number } {
  const providerLower = provider.toLowerCase();

  if (providerLower === "anthropic" || providerLower === "claude") {
    return extractAnthropicUsage(response);
  }

  if (providerLower === "openai" || providerLower === "gpt") {
    return extractOpenAIUsage(response);
  }

  if (providerLower === "google" || providerLower === "gemini") {
    return extractGeminiUsage(response);
  }

  return extractFallbackUsage(response);
}

function extractAnthropicUsage(response: any) {
  const usage = response?.usage ?? {};
  const tokensIn = usage.input_tokens ?? 0;
  const tokensOut = usage.output_tokens ?? 0;
  const tokensCachedIn = usage.cache_read_input_tokens ?? 0;
  return { tokensIn, tokensOut, tokensCachedIn };
}

function extractOpenAIUsage(response: any) {
  const usage = response?.usage ?? {};
  const tokensIn = usage.prompt_tokens ?? 0;
  const tokensOut = usage.completion_tokens ?? 0;
  return { tokensIn, tokensOut, tokensCachedIn: 0 };
}

function extractGeminiUsage(response: any) {
  const meta = response?.usageMetadata ?? {};
  const tokensIn = meta.promptTokenCount ?? 0;
  const tokensOut = meta.candidatesTokenCount ?? 0;
  return { tokensIn, tokensOut, tokensCachedIn: 0 };
}

function extractFallbackUsage(response: any) {
  if (response?.usage) {
    const u = response.usage;
    return {
      tokensIn: u.input_tokens ?? u.prompt_tokens ?? u.input ?? 0,
      tokensOut: u.output_tokens ?? u.completion_tokens ?? u.output ?? 0,
      tokensCachedIn: u.cache_read_input_tokens ?? u.cached_tokens ?? 0,
    };
  }

  if (response?.meta?.tokens) {
    const t = response.meta.tokens;
    return {
      tokensIn: t.input ?? t.prompt ?? 0,
      tokensOut: t.output ?? t.completion ?? 0,
      tokensCachedIn: 0,
    };
  }

  return { tokensIn: 0, tokensOut: 0, tokensCachedIn: 0 };
}

export function totalCost(run: RunTelemetry): number {
  return run.steps.reduce((sum, s) => sum + s.costUsd, 0);
}

export function totalTokens(run: RunTelemetry): {
  input: number;
  output: number;
  cached: number;
} {
  const input = run.steps.reduce((sum, s) => sum + s.tokensIn, 0);
  const output = run.steps.reduce((sum, s) => sum + s.tokensOut, 0);
  const cached = run.steps.reduce((sum, s) => sum + s.tokensCachedIn, 0);
  return { input, output, cached };
}

export function durationMs(run: RunTelemetry): number {
  if (run.completedAt) return run.completedAt - run.startedAt;
  return Date.now() - run.startedAt;
}
