import * as vscode from "vscode";

export type SecretKey = "cursorApiKey" | "piApiKey";

const SECRET_KEY_MAP: Record<SecretKey, string> = {
  cursorApiKey: "prism:cursor:apiKey",
  piApiKey: "prism:pi:apiKey",
};

export class PrismSecrets {
  private readonly storage: vscode.SecretStorage;

  constructor(context: vscode.ExtensionContext) {
    this.storage = context.secrets;
  }

  async get(key: SecretKey): Promise<string | undefined> {
    return this.storage.get(SECRET_KEY_MAP[key]);
  }

  async set(key: SecretKey, value: string): Promise<void> {
    await this.storage.store(SECRET_KEY_MAP[key], value);
  }

  async delete(key: SecretKey): Promise<void> {
    await this.storage.delete(SECRET_KEY_MAP[key]);
  }

  async migrateLegacy(): Promise<void> {
    const config = vscode.workspace.getConfiguration("prism");
    const legacyCursorKey = config.get<string>("apiKey", "");
    const legacyPiKey = config.get<string>("piApiKey", "");

    if (legacyCursorKey && !(await this.get("cursorApiKey"))) {
      await this.set("cursorApiKey", legacyCursorKey);
      await config.update("apiKey", undefined, true);
    }

    if (legacyPiKey && !(await this.get("piApiKey"))) {
      await this.set("piApiKey", legacyPiKey);
      await config.update("piApiKey", undefined, true);
    }
  }
}
