// Smoke test for team-build-chill-repo: ensureSkeletonExists scaffolds 7 pipeline templates
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const workspaceArg = process.argv[2];
const tmp = workspaceArg
  ? path.resolve(workspaceArg)
  : fs.mkdtempSync(path.join(os.tmpdir(), "tbc-scaffold-"));
console.log(`[probe] workspace: ${tmp}`);

// Stub vscode so engine-bridge can require it
const stubVscode = path.join(__dirname, ".vscode-stub.cjs");
fs.writeFileSync(
  stubVscode,
  "module.exports = { window: { showInformationMessage:()=>{}, showErrorMessage:()=>{}, showWarningMessage:()=>{}, createOutputChannel:()=>({appendLine:()=>{},show:()=>{},dispose:()=>{}}) }, workspace: { getConfiguration: () => ({ get: () => '' }), workspaceFolders: [] }, commands: { registerCommand: () => ({ dispose:()=>{} }) }, EventEmitter: class { fire(){} dispose(){} }, ConfigurationTarget: { Workspace: 2 }, Uri: { joinPath:()=>({}), file:()=>({}) }, ViewColumn: { One: 1, Beside: 2 }, StatusBarAlignment: { Left: 1 }, TreeItem: class {}, TreeItemCollapsibleState: { None: 0 }, ThemeIcon: class {}, LogOutputChannel: class {} };",
);
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === "vscode") return stubVscode;
  return origResolve.call(this, req, parent, ...rest);
};

(async () => {
  try {
    const { EngineBridge } = require("../dist/extension/engine-bridge.js");
    const log = { appendLine: () => {}, show: () => {} };
    const bridge = new EngineBridge(
      {
        workspaceRoot: tmp,
        onStateUpdate: () => {},
        onAgentEvent: () => {},
        onAgentStatus: () => {},
        onDecision: () => {},
        onError: () => {},
      },
      log,
    );

    bridge.ensureSkeletonExists();

    const dir = path.join(tmp, ".aidlc/pipelines");
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".yaml"))
          .sort()
      : [];
    console.log(`[probe] scaffolded ${files.length} pipelines:`);
    for (const f of files) console.log(`  - ${f}`);

    const expected = [
      "bug-fix.yaml",
      "code-review.yaml",
      "default.yaml",
      "feature-build.yaml",
      "full-stack-feature.yaml",
      "prd-to-prototype.yaml",
      "refactor.yaml",
    ];
    const missing = expected.filter((e) => !files.includes(e));
    if (missing.length > 0) {
      console.log(`[probe] FAIL — missing: ${missing.join(", ")}`);
      process.exit(1);
    }

    // Verify createBlankPipeline picks unique name
    const r1 = bridge.createBlankPipeline();
    console.log(`[probe] createBlankPipeline #1 → "${r1.name}"`);
    const r2 = bridge.createBlankPipeline();
    console.log(`[probe] createBlankPipeline #2 → "${r2.name}"`);
    if (r1.name !== "pipeline" || r2.name !== "pipeline-2") {
      console.log(`[probe] FAIL — expected "pipeline"/"pipeline-2", got "${r1.name}"/"${r2.name}"`);
      process.exit(1);
    }

    // Verify cloneFromTemplate uses clean naming (no -copy)
    const c1 = bridge.cloneFromTemplate("feature-build");
    console.log(`[probe] cloneFromTemplate("feature-build") → "${c1.name}"`);
    if (c1.name !== "feature-build-2") {
      console.log(`[probe] FAIL — expected "feature-build-2", got "${c1.name}"`);
      process.exit(1);
    }

    // Verify new templates exist + parse
    const fsf = bridge.selectPipeline("full-stack-feature");
    console.log(`[probe] full-stack-feature → ${fsf.steps.length} steps`);
    if (fsf.steps.length !== 6) {
      console.log(`[probe] FAIL — full-stack-feature should have 6 steps, got ${fsf.steps.length}`);
      process.exit(1);
    }

    console.log(`[probe] PASS`);
  } catch (err) {
    console.error(`[probe] FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
  } finally {
    try {
      fs.unlinkSync(stubVscode);
    } catch {}
  }
})();
