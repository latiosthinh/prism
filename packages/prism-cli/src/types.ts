export interface CliConfig {
  workspace: string;
  backend: "cursor" | "pi" | "anthropic";
  provider: string;
  model: string;
  apiKey: string;
  piApiKey: string;
  allowedCommands: string[];
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[]) => Promise<void>;
}

export interface CliToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
