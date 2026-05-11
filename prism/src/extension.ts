import * as vscode from "vscode";
import * as path from "path";
import * as yaml from "yaml";
import {
  EngineBridge,
  BridgeState,
  AgentStatus,
} from "./extension/engine-bridge.js";
import {
  AgentEvent,
  Decision,
  PipelineDefinition,
} from "./engine/index.js";

const PANEL_SCRIPT = "panel/assets/index.js";
const PANEL_STYLE = "panel/assets/index.css";

let panel: PipelinePanel | undefined;
let settingsPanel: vscode.WebviewPanel | undefined;

class PipelinePanel {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _bridge: EngineBridge;
  private readonly _extUri: vscode.Uri;
  private readonly _log: vscode.LogOutputChannel;
  private readonly _wsRoot: string;
  private readonly _context: vscode.ExtensionContext;
  private _disposed = false;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    bridge: EngineBridge,
    extUri: vscode.Uri,
    log: vscode.LogOutputChannel,
    wsRoot: string,
    context: vscode.ExtensionContext,
  ) {
    this._bridge = bridge;
    this._extUri = extUri;
    this._log = log;
    this._wsRoot = wsRoot;
    this._context = context;

    this._panel = vscode.window.createWebviewPanel(
      "prism.pipeline",
      "PRISM Pipeline",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extUri, "dist")],
      },
    );

    this._panel.webview.html = this._getHtml(this._panel.webview);

    this._disposables.push(
      this._panel.webview.onDidReceiveMessage((msg) =>
        this._handleMessage(msg),
      ),
    );
    this._disposables.push(
      this._panel.onDidDispose(() => this.dispose()),
    );
  }

  postMessage(msg: unknown): void {
    if (this._disposed) return;
    this._panel.webview.postMessage(msg);
  }

  reveal(): void {
    if (this._disposed) return;
    this._panel.reveal(vscode.ViewColumn.One);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    this._disposables = [];
    if (panel === this) panel = undefined;
  }

  isDisposed(): boolean {
    return this._disposed;
  }

  handleApproveStep(stepId?: string): void {
    if (!stepId) {
      const state = this._bridge.getBridgeState();
      const target = state.steps.find((s) => s.status === "in_review");
      if (!target) return;
      stepId = target.id;
    }
    this._bridge.handleApproveStep(stepId);
  }

  handleRejectStep(stepId?: string): void {
    if (!stepId) {
      const state = this._bridge.getBridgeState();
      const target = state.steps.find((s) => s.status === "in_review");
      if (!target) return;
      stepId = target.id;
    }
    this._bridge.handleRejectStep(stepId);
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extUri, "dist", PANEL_SCRIPT),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extUri, "dist", PANEL_STYLE),
    );
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
      `script-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} https://fonts.gstatic.com`,
      `img-src ${webview.cspSource} data:`,
      `connect-src ${webview.cspSource} https://fonts.googleapis.com https://fonts.gstatic.com`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Geist:wght@500;600;700&display=swap" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>PRISM Pipeline</title>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _handleMessage(msg: any): Promise<void> {
    if (!msg || typeof msg !== "object") return;
    try {
      switch (msg.type) {
        case "init": {
          this.postMessage({
            type: "bootstrap",
            pipelines: this._bridge.getPipelinesDetail(),
            agents: this._bridge.agents,
            skills: this._bridge.skills,
            state: this._bridge.getBridgeState(),
          });
          break;
        }
        case "startRun": {
          const pipelineName: string = msg.pipeline ?? "default";
          const idea: string | undefined = msg.idea;
          const title: string | undefined = msg.title;
          const description: string | undefined = msg.description;
          const customRunId: string | undefined = msg.customRunId;
          const freshKey = (await this._context.secrets.get("prism.apiKey")) || "";
          const freshPiKey = (await this._context.secrets.get("prism.piApiKey")) || "";
          if (freshKey) {
            this._bridge.updateApiKey(freshKey);
          }
          if (freshPiKey) {
            const freshConfig = vscode.workspace.getConfiguration("PRISM");
            this._bridge.updateBackend(
              freshConfig.get<"cursor" | "pi" | "anthropic">("backend", "cursor"),
              {
                piProvider: freshConfig.get<string>("piProvider", "anthropic"),
                piModel: freshConfig.get<string>("piModel", "claude-sonnet-4-20250514"),
                piApiKey: freshPiKey || undefined,
              },
            );
          }
          const def = this._bridge.selectPipeline(pipelineName);
          this.postMessage({
            type: "stateUpdate",
            state: this._bridge.getBridgeState(),
          });
          this._bridge
            .startRun(pipelineName, def, {
              idea,
              title,
              description,
              customRunId,
            })
            .catch((err: any) => {
              const m = err?.message ?? String(err);
              this._log.appendLine(`[panel] startRun failed: ${m}`);
              this.postMessage({ type: "error", message: m });
              vscode.window.showErrorMessage(
                `PRISM: failed to start "${pipelineName}" — ${m}`,
              );
            });
          break;
        }
        case "approveStep":
          this.handleApproveStep(msg.stepId);
          break;
        case "rejectStep":
          this.handleRejectStep(msg.stepId);
          break;
        case "openArtifact": {
          const artifact: string | undefined = msg.path;
          if (!artifact) break;
          const abs = path.isAbsolute(artifact)
            ? artifact
            : path.join(this._wsRoot, artifact);
          try {
            const doc = await vscode.workspace.openTextDocument(abs);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
          } catch (err: any) {
            vscode.window.showWarningMessage(
              `Failed to open artifact: ${err?.message ?? err}`,
            );
          }
          break;
        }
        case "cancelRun":
          this._bridge.cancelRun();
          break;
        case "resumeRun":
          try {
            await this._bridge.resumeRun();
          } catch (err: any) {
            this.postMessage({
              type: "error",
              message: `Failed to resume run: ${err?.message ?? err}`,
            });
          }
          break;
        case "editPipeline": {
          const name: string = msg.name;
          try {
            const def = this._bridge.selectPipeline(name);
            this.postMessage({
              type: "pipelineData",
              name,
              pipeline: def,
              agents: this._bridge.agents,
              skills: this._bridge.skills,
            });
          } catch (err: any) {
            this.postMessage({
              type: "error",
              message: `Failed to load pipeline '${name}': ${err?.message ?? err}`,
            });
          }
          break;
        }
        case "createPipeline": {
          try {
            const result = this._bridge.createBlankPipeline();
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
            this.postMessage({
              type: "pipelineData",
              name: result.name,
              pipeline: result.pipeline,
              agents: this._bridge.agents,
              skills: this._bridge.skills,
            });
            vscode.window.showInformationMessage(
              `Pipeline "${result.name}" created — opening editor...`,
            );
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(`[panel] createPipeline failed: ${msg2}`);
            vscode.window.showErrorMessage(
              `Failed to create blank pipeline: ${msg2}`,
            );
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
          }
          break;
        }
        case "createFromTemplate": {
          const template: string = msg.template;
          try {
            const result = this._bridge.cloneFromTemplate(template);
            if (!result) {
              vscode.window.showErrorMessage(
                `Template "${template}" not found`,
              );
              this.postMessage({
                type: "error",
                message: `Template "${template}" not found`,
              });
              this.postMessage({
                type: "pipelineList",
                pipelines: this._bridge.getPipelinesDetail(),
              });
              break;
            }
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
            this.postMessage({
              type: "pipelineData",
              name: result.name,
              pipeline: result.pipeline,
              agents: this._bridge.agents,
              skills: this._bridge.skills,
            });
            vscode.window.showInformationMessage(
              `Pipeline "${result.name}" created from template "${template}" — opening editor...`,
            );
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(
              `[panel] createFromTemplate(${template}) failed: ${msg2}`,
            );
            vscode.window.showErrorMessage(
              `Failed to create from template "${template}": ${msg2}`,
            );
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
          }
          break;
        }
        case "savePipeline": {
          // `name` is the CURRENT file basename (== panel's `selectedPipeline`).
          // The bridge derives the new file basename from `pipeline.name`
          // (slugified) and may rename the file. The panel is informed of the
          // canonical name via `pipelineSaved` and a fresh `pipelineData`.
          const currentName: string = msg.name;
          const pipeline: PipelineDefinition = msg.pipeline;
          try {
            const { name: finalName, renamedFrom } =
              this._bridge.saveAndRenamePipeline(currentName, pipeline);
            this.postMessage({
              type: "pipelineSaved",
              name: finalName,
              renamedFrom,
            });
            if (renamedFrom) {
              const fresh = this._bridge.selectPipeline(finalName);
              this.postMessage({
                type: "pipelineData",
                name: finalName,
                pipeline: fresh,
                agents: this._bridge.agents,
                skills: this._bridge.skills,
              });
              // Run states were migrated by the bridge — push a fresh runList
              // so the Runs tab and rerun buttons see the new basename.
              this.postMessage({
                type: "runList",
                runs: this._bridge.listRuns(),
              });
            }
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
            vscode.window.showInformationMessage(
              renamedFrom
                ? `Pipeline saved (renamed: "${renamedFrom}" → "${finalName}").`
                : `Pipeline "${finalName}" saved.`,
            );
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(`[panel] savePipeline failed: ${msg2}`);
            vscode.window.showErrorMessage(
              `Failed to save pipeline "${currentName}": ${msg2}`,
            );
            this.postMessage({ type: "error", message: msg2 });
          }
          break;
        }
        case "renamePipeline":
          try {
            this._bridge.renamePipeline(msg.oldName, msg.newName);
            this.postMessage({
              type: "pipelineList",
              pipelines: this._bridge.getPipelinesDetail(),
            });
            // Run states were migrated by the bridge — refresh the Runs view.
            this.postMessage({
              type: "runList",
              runs: this._bridge.listRuns(),
            });
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(`[panel] renamePipeline failed: ${msg2}`);
            vscode.window.showErrorMessage(
              `Failed to rename "${msg.oldName}" → "${msg.newName}": ${msg2}`,
            );
          }
          break;
        case "saveSkill":
          try {
            this._bridge.saveSkill(msg.id, msg.content);
            this.postMessage({ type: "skillSaved", id: msg.id });
            this.postMessage({
              type: "skillList",
              skills: this._bridge.skills,
            });
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(`[panel] saveSkill failed: ${msg2}`);
            vscode.window.showErrorMessage(
              `Failed to save skill "${msg.id}": ${msg2}`,
            );
          }
          break;
        case "listRuns":
          this.postMessage({
            type: "runList",
            runs: this._bridge.listRuns(),
          });
          break;
        case "listPipelines":
          this.postMessage({
            type: "pipelineList",
            pipelines: this._bridge.getPipelinesDetail(),
          });
          break;
        case "selectRun": {
          const state = this._bridge.loadRunById(msg.runId);
          this.postMessage({
            type: "runState",
            state,
          });
          break;
        }
        case "getRunEvents": {
          const runId: string = msg.runId;
          const events = this._bridge.loadRunEvents(runId);
          this.postMessage({
            type: "runEvents",
            runId,
            events,
          });
          break;
        }
        case "getStepPrompt": {
          const runId: string = msg.runId;
          const stepId: string = msg.stepId;
          const content = this._bridge.loadStepPrompt(runId, stepId) ?? "";
          this.postMessage({
            type: "stepPrompt",
            stepId,
            content,
          });
          break;
        }
        case "getStepLog": {
          const runId: string = msg.runId;
          const stepId: string = msg.stepId;
          const file = path.join(
            this._wsRoot,
            ".PRISM",
            "runs",
            runId,
            "steps",
            stepId,
            "latest.md",
          );
          try {
            const fs = await import("fs");
            const content = fs.existsSync(file)
              ? fs.readFileSync(file, "utf8")
              : "";
            this.postMessage({
              type: "stepLog",
              stepId,
              content,
            });
          } catch (err: any) {
            this.postMessage({
              type: "stepLog",
              stepId,
              content: "",
              error: err?.message ?? String(err),
            });
          }
          break;
        }
        case "rerunStep": {
          const ok = await vscode.window.showWarningMessage(
            `Re-run step "${msg.stepId}"? This will reset the step to pending.`,
            { modal: true },
            "Re-run",
          );
          if (ok === "Re-run") {
            this._bridge.rerunStep(msg.stepId);
          }
          break;
        }
        case "getSettings": {
          const settings = await readPRISMSettings(context);
          this.postMessage({
            type: "settings",
            settings,
          });
          break;
        }
        case "saveSettings": {
          try {
            await writePRISMSettings(context, msg.settings ?? {});
            const fresh = await readPRISMSettings(context);
            if (typeof fresh.apiKey === "string") {
              this._bridge.updateApiKey(fresh.apiKey || undefined);
            }
            if (typeof fresh.piApiKey === "string") {
              this._bridge.updateBackend(
                fresh.backend,
                { piProvider: fresh.piProvider, piModel: fresh.piModel, piApiKey: fresh.piApiKey || undefined },
              );
            }
            this.postMessage({ type: "settings", settings: fresh });
            vscode.window.showInformationMessage("PRISM settings saved.");
          } catch (err: any) {
            const msg2 = err?.message ?? String(err);
            this._log.appendLine(`[panel] saveSettings failed: ${msg2}`);
            vscode.window.showErrorMessage(`Failed to save settings: ${msg2}`);
            this.postMessage({ type: "error", message: msg2 });
          }
          break;
        }
        case "verifyCursorSdk": {
          this.postMessage({ type: "verifyCursorSdkStarted" });
          const result = await runVerifyCursorSdk(this._wsRoot, this._log, this._context);
          this.postMessage({
            type: "verifyCursorSdkResult",
            result,
          });
          break;
        }
        default:
          this._log.appendLine(`[panel] Unknown message type: ${msg.type}`);
      }
    } catch (err: any) {
      this._log.appendLine(`[panel] handler error: ${err?.message ?? err}`);
      this.postMessage({
        type: "error",
        message: err?.message ?? String(err),
      });
    }
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showWarningMessage(
      "PRISM requires an open workspace folder.",
    );
    return;
  }

  const log = vscode.window.createOutputChannel("PRISM", { log: true });
  context.subscriptions.push(log);

  // --- SecretStorage migration ---
  // Migrate API keys from settings.json (plain text) to VS Code SecretStorage (encrypted).
  await migrateApiKeysToSecretStorage(context, log);

  const config = vscode.workspace.getConfiguration("PRISM");

  // Read API keys from SecretStorage first, fall back to config for migration period
  const apiKey = (await context.secrets.get("prism.apiKey")) || config.get<string>("apiKey", "") || "";
  const piApiKey = (await context.secrets.get("prism.piApiKey")) || config.get<string>("piApiKey", "") || "";

  // Read autoApprove from new key, fall back to old key for migration
  const autoApprove = config.get<boolean>("prism.gates.autoApprove", config.get<boolean>("autoApproveYolo", false));

  const backend = config.get<"cursor" | "pi" | "anthropic">("backend", "cursor");
  const piProvider = config.get<string>("piProvider", "anthropic");
  const piModel = config.get<string>("piModel", "claude-sonnet-4-20250514");
  const allowedCommands = config.get<string[]>("allowedCommands", []);

  const bridge = new EngineBridge(
    {
      workspaceRoot: wsRoot,
      apiKey: apiKey || undefined,
      backend,
      piProvider,
      piModel,
      piApiKey: piApiKey || undefined,
      allowedCommands,
      getSecrets: (key: string) => context.secrets.get(key),
      storeSecret: (key: string, value: string) => context.secrets.store(key, value),
      deleteSecret: (key: string) => context.secrets.delete(key),
      onStateUpdate: (state: BridgeState) => {
        panel?.postMessage({ type: "stateUpdate", state });
      },
      onAgentEvent: (event: AgentEvent) => {
        panel?.postMessage({ type: "agentEvent", event });
      },
      onAgentStatus: (status: AgentStatus) => {
        panel?.postMessage({ type: "agentStatus", status });
      },
      onDecision: (decision: Decision) => {
        panel?.postMessage({ type: "decision", decision });
      },
      onError: (error: string) => {
        log.appendLine(`[bridge] error: ${error}`);
        vscode.window.showErrorMessage(`PRISM: ${error}`);
      },
    },
    log,
  );

  try {
    bridge.ensureSkeletonExists();
  } catch (err: any) {
    log.appendLine(`[activate] skeleton failed: ${err?.message ?? err}`);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("prism.apiKey")) {
        const freshKey = vscode.workspace
          .getConfiguration("PRISM")
          .get<string>("apiKey", "");
        bridge.updateApiKey(freshKey || undefined);
        log.appendLine(
          `[config] apiKey updated (length: ${freshKey.length})`,
        );
      }
      if (e.affectsConfiguration("prism.backend") ||
          e.affectsConfiguration("prism.piProvider") ||
          e.affectsConfiguration("prism.piModel") ||
          e.affectsConfiguration("prism.piApiKey")) {
        const freshConfig = vscode.workspace.getConfiguration("PRISM");
        const backend = freshConfig.get<"cursor" | "pi" | "anthropic">("backend", "cursor");
        const piProvider = freshConfig.get<string>("piProvider", "anthropic");
        const piModel = freshConfig.get<string>("piModel", "claude-sonnet-4-20250514");
        const piApiKey = freshConfig.get<string>("piApiKey", "");
        bridge.updateBackend(backend, {
          piProvider,
          piModel,
          piApiKey: piApiKey || undefined,
        });
        log.appendLine(`[config] backend updated to: ${backend}`);
      }
      if (e.affectsConfiguration("prism.gates.autoApprove") ||
          e.affectsConfiguration("prism.autoApproveYolo")) {
        log.appendLine(
          `[config] autoApprove setting changed`,
        );
      }
    }),
  );

  const showPanel = (): void => {
    if (panel && !panel.isDisposed()) {
      panel.reveal();
      return;
    }
    panel = new PipelinePanel(bridge, context.extensionUri, log, wsRoot, context);
  };

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  status.text = "$(symbol-ruler) PRISM";
  status.command = "prism.openPanel";
  status.tooltip = "Open PRISM pipeline";
  status.show();
  context.subscriptions.push(status);

  context.subscriptions.push(
    vscode.commands.registerCommand("prism.openPanel", () => showPanel()),
    vscode.commands.registerCommand("prism.startRun", () => showPanel()),
    vscode.commands.registerCommand("prism.newPipeline", () => showPanel()),
    vscode.commands.registerCommand("prism.openArtifact", async () => {
      const file = await vscode.window.showInputBox({
        prompt: "Artifact path (relative to workspace)",
      });
      if (!file) return;
      const abs = path.isAbsolute(file) ? file : path.join(wsRoot, file);
      try {
        const doc = await vscode.workspace.openTextDocument(abs);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to open: ${err?.message ?? err}`,
        );
      }
    }),
    vscode.commands.registerCommand("prism.showDecisionLog", () => showPanel()),
    vscode.commands.registerCommand("prism.openSettings", () =>
      showSettings(context),
    ),
    vscode.commands.registerCommand("prism.approveStep", () => {
      panel?.handleApproveStep();
    }),
    vscode.commands.registerCommand("prism.rejectStep", () => {
      panel?.handleRejectStep();
    }),
    vscode.commands.registerCommand("prism.resumeRun", async () => {
      try {
        await bridge.resumeRun();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Resume failed: ${err?.message ?? err}`,
        );
      }
    }),
    vscode.commands.registerCommand("prism.dryRun", () => {
      const detail = bridge.getPipelinesDetail();
      if (detail.length === 0) {
        vscode.window.showInformationMessage("No pipelines to dry-run.");
        return;
      }
      bridge.runDryRun(detail[0].name);
      showPanel();
    }),
    vscode.commands.registerCommand("prism.verifyCursorSdk", async () => {
      log.show?.(true);
      const result = await runVerifyCursorSdk(wsRoot, log, context);
      if (result.status === "ok") {
        vscode.window.showInformationMessage(
          "PRISM: Cursor SDK verified ✓ (composer-2 reachable). See PRISM output for details.",
        );
      } else {
        vscode.window.showErrorMessage(
          `PRISM: SDK verify failed — ${result.message ?? "unknown error"}`,
        );
      }
    }),
  );
}

interface VerifyCursorSdkResult {
  status: "ok" | "error";
  apiKeyLen?: number;
  modelsCount?: number;
  testRunMs?: number;
  message?: string;
}

/**
 * Shared implementation of `PRISM: Verify Cursor SDK` so it can be invoked
 * both from the command palette and from the in-panel Settings page.
 * Always logs to the PRISM output channel; returns a structured result.
 */
async function runVerifyCursorSdk(
  wsRoot: string,
  log: vscode.OutputChannel,
  context: vscode.ExtensionContext,
): Promise<VerifyCursorSdkResult> {
  const key = (await context.secrets.get("prism.apiKey")) || "";
  log.appendLine("");
  log.appendLine("=== PRISM: Verify Cursor SDK ===");
  log.appendLine(`[verify] cwd: ${wsRoot}`);
  log.appendLine(
    `[verify] apiKey: ${key ? `set (length ${key.length})` : "NOT SET — open Settings and paste your Cursor API key"}`,
  );
  if (!key) {
    return {
      status: "error",
      message:
        "prism.apiKey is not set. Open the Settings tab and paste your Cursor API key.",
    };
  }
  let modelsCount: number | undefined;
  try {
    const sdk: any = await import("@cursor/sdk");
    log.appendLine(`[verify] @cursor/sdk loaded`);

    if (sdk?.Cursor?.me) {
      try {
        const me = await sdk.Cursor.me({ apiKey: key });
        log.appendLine(`[verify] Cursor.me OK: ${JSON.stringify(me)}`);
      } catch (e: any) {
        log.appendLine(
          `[verify] Cursor.me failed: ${e?.message ?? String(e)}`,
        );
      }
    }

    if (sdk?.Cursor?.models?.list) {
      try {
        const models = await sdk.Cursor.models.list({ apiKey: key });
        modelsCount = Array.isArray(models)
          ? models.length
          : Array.isArray((models as any)?.models)
            ? (models as any).models.length
            : undefined;
        log.appendLine(
          `[verify] models: ${JSON.stringify(models).slice(0, 400)}`,
        );
      } catch (e: any) {
        log.appendLine(
          `[verify] models.list failed: ${e?.message ?? String(e)}`,
        );
      }
    }

    log.appendLine(`[verify] creating Agent (composer-2)...`);
    const t0 = Date.now();
    let agent: any;
    try {
      agent = await sdk.Agent.create({
        apiKey: key,
        model: { id: "composer-2" },
        local: { cwd: wsRoot },
      });
      log.appendLine(
        `[verify] Agent.create OK in ${Date.now() - t0}ms (agentId=${agent?.agentId ?? "?"})`,
      );
    } catch (e: any) {
      const ms = Date.now() - t0;
      const msg = e?.message ?? String(e);
      log.appendLine(`[verify] Agent.create FAILED in ${ms}ms: ${msg}`);
      return {
        status: "error",
        apiKeyLen: key.length,
        modelsCount,
        message: `Agent.create failed in ${ms}ms: ${msg}`,
      };
    }

    try {
      const run = await agent.send(
        "Reply with the single word: PONG. Do not call any tools.",
      );
      log.appendLine(`[verify] sent ping; waiting for result...`);
      const tRun0 = Date.now();
      const result = await run.wait();
      const testRunMs = Date.now() - tRun0;
      log.appendLine(
        `[verify] run.status=${result?.status} result=${JSON.stringify(result?.result).slice(0, 300)}`,
      );
      if (result?.status === "completed") {
        return {
          status: "ok",
          apiKeyLen: key.length,
          modelsCount,
          testRunMs,
        };
      }
      return {
        status: "error",
        apiKeyLen: key.length,
        modelsCount,
        testRunMs,
        message: `Test run ended with status "${result?.status}".`,
      };
    } finally {
      try {
        await agent.close?.();
      } catch {
        /* ignore */
      }
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    log.appendLine(`[verify] FATAL: ${msg}`);
    return { status: "error", apiKeyLen: key.length, message: msg };
  }
}

/** Migrate API keys from settings.json (plain text) to VS Code SecretStorage (encrypted). */
async function migrateApiKeysToSecretStorage(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("PRISM");
  const settingsKey = config.get<string>("apiKey", "");
  const settingsPiKey = config.get<string>("piApiKey", "");

  const secretKey = await context.secrets.get("prism.apiKey");
  const secretPiKey = await context.secrets.get("prism.piApiKey");

  if (settingsKey && !secretKey) {
    await context.secrets.store("prism.apiKey", settingsKey);
    log.appendLine("[secrets] Migrated prism.apiKey from settings.json → SecretStorage");
    try {
      await config.update("apiKey", undefined, vscode.ConfigurationTarget.Workspace);
      await config.update("apiKey", undefined, vscode.ConfigurationTarget.Global);
    } catch {
      /* Best-effort cleanup */
    }
  }

  if (settingsPiKey && !secretPiKey) {
    await context.secrets.store("prism.piApiKey", settingsPiKey);
    log.appendLine("[secrets] Migrated prism.piApiKey from settings.json → SecretStorage");
    try {
      await config.update("piApiKey", undefined, vscode.ConfigurationTarget.Workspace);
      await config.update("piApiKey", undefined, vscode.ConfigurationTarget.Global);
    } catch {
      /* Best-effort cleanup */
    }
  }

  // Migrate autoApproveYolo → gates.autoApprove
  const oldAutoApprove = config.get<boolean>("autoApproveYolo", false);
  const newAutoApprove = config.inspect<boolean>("prism.gates.autoApprove");
  if (oldAutoApprove && newAutoApprove?.workspaceValue === undefined && newAutoApprove?.globalValue === undefined) {
    await config.update("prism.gates.autoApprove", true, vscode.ConfigurationTarget.Workspace);
    log.appendLine("[secrets] Migrated autoApproveYolo → prism.gates.autoApprove");
  }
}

/** All PRISM settings the panel cares about, read from VS Code workspace config + SecretStorage. */
async function readPRISMSettings(context: vscode.ExtensionContext): Promise<{
  apiKey: string;
  backend: "cursor" | "pi" | "anthropic";
  piProvider: string;
  piModel: string;
  piApiKey: string;
  model: string;
  modelOverride: string;
  maxTokens: number;
  autoApproveYolo: boolean;
  gatesAutoApprove: boolean;
  gitignoreArtifacts: boolean;
  gateTimeout: number;
  commandConfirmation: boolean;
}> {
  const cfg = vscode.workspace.getConfiguration("PRISM");
  const apiKey = (await context.secrets.get("prism.apiKey")) || "";
  const piApiKey = (await context.secrets.get("prism.piApiKey")) || "";
  return {
    apiKey,
    backend: cfg.get<"cursor" | "pi" | "anthropic">("backend", "cursor") ?? "cursor",
    piProvider: cfg.get<string>("piProvider", "anthropic") ?? "anthropic",
    piModel: cfg.get<string>("piModel", "claude-sonnet-4-20250514") ?? "claude-sonnet-4-20250514",
    piApiKey,
    model: cfg.get<string>("model", "claude-sonnet-4-20250514") ?? "",
    modelOverride: cfg.get<string>("modelOverride", "") ?? "",
    maxTokens: cfg.get<number>("maxTokens", 8192) ?? 8192,
    autoApproveYolo: cfg.get<boolean>("autoApproveYolo", false) ?? false,
    gatesAutoApprove: cfg.get<boolean>("prism.gates.autoApprove", false) ?? false,
    gitignoreArtifacts: cfg.get<boolean>("gitignoreArtifacts", false) ?? false,
    gateTimeout: cfg.get<number>("gateTimeout", 0) ?? 0,
    commandConfirmation: cfg.get<boolean>("commandConfirmation", true) ?? true,
  };
}

/**
 * Persist a partial settings update. API keys go to SecretStorage;
 * other settings go to workspace config.
 */
async function writePRISMSettings(
  context: vscode.ExtensionContext,
  next: Record<string, unknown>,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("PRISM");
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  // API keys → SecretStorage
  if ("apiKey" in next && typeof next.apiKey === "string") {
    if (next.apiKey) {
      await context.secrets.store("prism.apiKey", next.apiKey);
    } else {
      await context.secrets.delete("prism.apiKey");
    }
  }
  if ("piApiKey" in next && typeof next.piApiKey === "string") {
    if (next.piApiKey) {
      await context.secrets.store("prism.piApiKey", next.piApiKey);
    } else {
      await context.secrets.delete("prism.piApiKey");
    }
  }

  // Map legacy autoApproveYolo → gates.autoApprove for backward compat
  if ("autoApproveYolo" in next) {
    (next as any)["prism.gates.autoApprove"] = next.autoApproveYolo;
  }

  const allowed: Record<string, "string" | "number" | "boolean"> = {
    backend: "string",
    piProvider: "string",
    piModel: "string",
    model: "string",
    modelOverride: "string",
    maxTokens: "number",
    autoApproveYolo: "boolean",
    "prism.gates.autoApprove": "boolean",
    gitignoreArtifacts: "boolean",
    gateTimeout: "number",
    commandConfirmation: "boolean",
  };
  for (const [k, t] of Object.entries(allowed)) {
    if (!(k in next)) continue;
    const v = (next as any)[k];
    if (typeof v !== t) continue;
    await cfg.update(k, v, target);
  }
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
  settingsPanel?.dispose();
  settingsPanel = undefined;
}

function showSettings(context: vscode.ExtensionContext): void {
  if (settingsPanel) {
    settingsPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  settingsPanel = vscode.window.createWebviewPanel(
    "prism.settings",
    "PRISM Settings",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  (async () => {
    const config = vscode.workspace.getConfiguration("PRISM");
    const apiKey = (await context.secrets.get("prism.apiKey")) || "";
    const model = config.get("model", "claude-sonnet-4-20250514") as string;
    const modelOverride = config.get("modelOverride", "") as string;
    const maxTokens = config.get("maxTokens", 8192) as number;
    const autoApprove = config.get<boolean>("prism.gates.autoApprove", config.get<boolean>("autoApproveYolo", false));

    settingsPanel!.webview.html = getSettingsHtml(
      apiKey,
      model,
      modelOverride,
      maxTokens,
      autoApprove,
    );

    settingsPanel!.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg?.type !== "save") return;
        // API keys → SecretStorage
        if (msg.apiKey) {
          await context.secrets.store("prism.apiKey", msg.apiKey);
        } else {
          await context.secrets.delete("prism.apiKey");
        }
        await config.update(
          "model",
          msg.model,
          vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
          "modelOverride",
          msg.modelOverride,
          vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
          "maxTokens",
          msg.maxTokens,
          vscode.ConfigurationTarget.Workspace,
        );
        await config.update(
          "prism.gates.autoApprove",
          msg.autoApprove,
          vscode.ConfigurationTarget.Workspace,
        );
        settingsPanel?.webview.postMessage({ type: "saved" });
      },
      undefined,
      context.subscriptions,
    );

    settingsPanel!.onDidDispose(
      () => {
        settingsPanel = undefined;
      },
      null,
      context.subscriptions,
    );
  })();
}

function getSettingsHtml(
  apiKey: string,
  model: string,
  modelOverride: string,
  maxTokens: number,
  autoApprove: boolean,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: #09090b; --card: #18181b; --border: #27272a;
      --fg: #fafafa; --muted: #a1a1aa; --primary: #fafafa;
      --input: #18181b; --ring: #52525b;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--fg); padding: 24px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 20px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .field input[type="text"], .field input[type="password"], .field input[type="number"], .field select {
      width: 100%; padding: 8px 10px; background: var(--input); border: 1px solid var(--border);
      border-radius: 6px; color: var(--fg); font-size: 13px; outline: none;
    }
    .field input:focus, .field select:focus { border-color: var(--ring); }
    .field select option { background: var(--card); color: var(--fg); }
    .field .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
    .checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .checkbox input { accent-color: var(--primary); }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-primary { background: var(--primary); color: var(--bg); }
    .btn-primary:hover { opacity: 0.9; }
    .saved-msg { color: #4ade80; font-size: 12px; margin-left: 8px; opacity: 0; transition: opacity 0.3s; }
    .saved-msg.show { opacity: 1; }
  </style>
</head>
<body>
  <h2>PRISM Settings</h2>
  <div class="field">
    <label>Cursor API Key</label>
    <input type="password" id="apiKey" value="${escapeHtml(apiKey)}" placeholder="Enter your Cursor API key" />
    <div class="hint">Used for agent authentication when running outside Cursor IDE</div>
  </div>
  <div class="field">
    <label>Model</label>
    <select id="model">
      ${[
        ["default", "Auto (default)"],
        ["composer-2", "Composer 2"],
        ["composer-1.5", "Composer 1.5"],
        ["claude-sonnet-4-20250514", "Claude Sonnet 4"],
        ["claude-3.5-haiku-20241022", "Claude 3.5 Haiku"],
        ["gpt-4o-2024-11-20", "GPT-4o"],
        ["gpt-4o-mini-2024-07-18", "GPT-4o Mini"],
        ["gemini-2.0-flash-001", "Gemini 2.0 Flash"],
        ["gemini-2.5-pro-exp-03-25", "Gemini 2.5 Pro"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${model === v ? "selected" : ""}>${label}</option>`,
        )
        .join("\n      ")}
    </select>
    <div class="hint">Select a known model or use the override field below</div>
  </div>
  <div class="field">
    <label>Model Override (optional)</label>
    <input type="text" id="modelOverride" value="${escapeHtml(modelOverride)}" placeholder="e.g., claude-opus-4-20250514" />
    <div class="hint">If set, takes precedence over the dropdown</div>
  </div>
  <div class="field">
    <label>Max Tokens</label>
    <input type="number" id="maxTokens" value="${maxTokens}" min="1024" max="64000" />
  </div>
  <div class="field">
    <div class="checkbox">
      <input type="checkbox" id="autoApprove" ${autoApprove ? "checked" : ""} />
      <label for="autoApprove">Auto-approve YOLO tasks</label>
    </div>
  </div>
  <button class="btn btn-primary" onclick="save()">Save Settings</button>
  <span class="saved-msg" id="savedMsg">Saved!</span>
  <script>
    const vscode = acquireVsCodeApi();
    function save() {
      vscode.postMessage({
        type: "save",
        apiKey: document.getElementById("apiKey").value,
        model: document.getElementById("model").value,
        modelOverride: document.getElementById("modelOverride").value,
        maxTokens: parseInt(document.getElementById("maxTokens").value),
        autoApprove: document.getElementById("autoApprove").checked,
      });
    }
    window.addEventListener("message", (e) => {
      if (e.data.type === "saved") {
        const msg = document.getElementById("savedMsg");
        msg.classList.add("show");
        setTimeout(() => msg.classList.remove("show"), 2000);
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
