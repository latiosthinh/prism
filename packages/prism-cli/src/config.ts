import * as fs from "fs";
import * as path from "path";
import type { CliConfig } from "./types.js";

const DEFAULT_CONFIG: Omit<CliConfig, "workspace"> = {
  backend: "pi",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: "",
  piApiKey: "",
  allowedCommands: [
    "ls", "cat", "grep", "find", "head", "tail", "wc", "echo",
    "mkdir", "touch", "npm", "node", "python", "git", "cp", "mv", "rm",
  ],
};

export function loadConfig(overrides: Partial<CliConfig> = {}): CliConfig {
  const workspace = overrides.workspace ?? process.cwd();
  const configPath = findConfigFile(workspace);
  const fileConfig = configPath ? loadConfigFile(configPath) : {};
  const envConfig = loadEnvConfig();

  return {
    workspace,
    backend: (overrides.backend ?? envConfig.backend ?? fileConfig.backend ?? DEFAULT_CONFIG.backend),
    provider: (overrides.provider ?? envConfig.provider ?? fileConfig.provider ?? DEFAULT_CONFIG.provider),
    model: (overrides.model ?? envConfig.model ?? fileConfig.model ?? DEFAULT_CONFIG.model),
    apiKey: (overrides.apiKey ?? envConfig.apiKey ?? fileConfig.apiKey ?? DEFAULT_CONFIG.apiKey),
    piApiKey: (overrides.piApiKey ?? envConfig.piApiKey ?? fileConfig.piApiKey ?? DEFAULT_CONFIG.piApiKey),
    allowedCommands: (overrides.allowedCommands ?? fileConfig.allowedCommands ?? DEFAULT_CONFIG.allowedCommands),
  };
}

function findConfigFile(workspace: string): string | null {
  const candidates = [
    path.join(workspace, ".prismrc"),
    path.join(workspace, ".prismrc.json"),
    path.join(process.env.HOME ?? "", ".prismrc"),
    path.join(process.env.HOME ?? "", ".prismrc.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadConfigFile(filePath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadEnvConfig(): Partial<CliConfig> {
  const result: Partial<CliConfig> = {};
  if (process.env.PRISM_BACKEND) result.backend = process.env.PRISM_BACKEND as CliConfig["backend"];
  if (process.env.PRISM_PROVIDER) result.provider = process.env.PRISM_PROVIDER;
  if (process.env.PRISM_MODEL) result.model = process.env.PRISM_MODEL;
  if (process.env.PRISM_API_KEY) result.apiKey = process.env.PRISM_API_KEY;
  if (process.env.PRISM_PI_API_KEY) result.piApiKey = process.env.PRISM_PI_API_KEY;
  return result;
}
