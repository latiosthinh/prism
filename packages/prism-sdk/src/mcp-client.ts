export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export class McpClientManager {
  private servers: Map<string, McpServerConfig> = new Map();
  private initialized = false;

  registerServer(config: McpServerConfig): void {
    this.servers.set(config.name, config);
  }

  registerServers(configs: McpServerConfig[]): void {
    for (const config of configs) {
      this.registerServer(config);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async listTools(serverName?: string): Promise<McpTool[]> {
    const tools: McpTool[] = [];

    for (const [name] of this.servers) {
      if (serverName && name !== serverName) continue;
      try {
        const serverTools = await this.fetchTools(name);
        tools.push(...serverTools);
      } catch {
        /* server unavailable */
      }
    }

    return tools;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server "${serverName}" not registered`);
    }

    try {
      const result = await this.executeToolCall(server, toolName, args);
      return result;
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err?.message ?? err}` }],
        isError: true,
      };
    }
  }

  async listResources(serverName?: string): Promise<McpResource[]> {
    const resources: McpResource[] = [];

    for (const [name] of this.servers) {
      if (serverName && name !== serverName) continue;
      try {
        const serverResources = await this.fetchResources(name);
        resources.push(...serverResources);
      } catch {
        /* server unavailable */
      }
    }

    return resources;
  }

  async disconnect(): Promise<void> {
    this.servers.clear();
    this.initialized = false;
  }

  private async fetchTools(_serverName: string): Promise<McpTool[]> {
    return [];
  }

  private async fetchResources(_serverName: string): Promise<McpResource[]> {
    return [];
  }

  private async executeToolCall(
    _server: McpServerConfig,
    _toolName: string,
    _args: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    return {
      content: [{ type: "text", text: "MCP tool execution not yet implemented" }],
      isError: false,
    };
  }
}

export function parseMcpServersFromPipeline(
  pipeline: Record<string, unknown>,
): McpServerConfig[] {
  const mcpServers = pipeline.mcp_servers as McpServerConfig[] | undefined;
  if (!Array.isArray(mcpServers)) return [];

  return mcpServers
    .filter((s) => s && typeof s.name === "string" && typeof s.command === "string")
    .map((s) => ({
      name: s.name,
      command: s.command,
      args: Array.isArray(s.args) ? s.args : undefined,
      env: s.env && typeof s.env === "object" ? s.env as Record<string, string> : undefined,
    }));
}
