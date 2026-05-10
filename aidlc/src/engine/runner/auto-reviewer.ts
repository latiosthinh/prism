import * as fs from "fs";
import * as path from "path";
import { StepRunState, ReviewResult, ReviewVerdict } from "../pipeline/schema.js";

export interface StructuralCheck {
  name: string;
  check: (output: string) => boolean;
  failMessage: string;
}

export interface SemanticResult {
  passed: boolean;
  details: string[];
}

export interface ReviewOptions {
  structuralChecks: StructuralCheck[];
  semanticCheck?: (output: string) => Promise<SemanticResult>;
}

export interface ValidatorContext {
  stepId: string;
  workspaceRoot: string;
  artifactFile: string;
  referencedFiles: string[];
}

export interface ValidatorResult {
  passed: boolean;
  details: string[];
}

export interface CustomValidator {
  name: string;
  validate: (
    output: string,
    context: ValidatorContext,
  ) => Promise<ValidatorResult>;
}

const IMPLEMENTATION_TAGS = new Set([
  "code",
  "build",
  "implement",
  "implementation",
]);

const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".scss",
  ".html",
  ".json",
];

const SKIP_DIRS = new Set(["node_modules", ".aidlc"]);

export class AutoReviewer {
  private readonly workspaceRoot?: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async review(
    stepId: string,
    state: StepRunState,
    output: string,
    customChecks?: StructuralCheck[],
    customValidators?: CustomValidator[],
    stepTags?: string[],
  ): Promise<ReviewResult> {
    const isImpl = (stepTags ?? []).some((t) =>
      IMPLEMENTATION_TAGS.has(t.toLowerCase()),
    );
    const checks =
      customChecks ??
      (isImpl ? this.implementationChecks() : this.defaultStructuralChecks());

    const structuralResults = checks.map((c) => ({
      name: c.name,
      pass: this.safeCheck(c.check, output),
      message: c.failMessage,
    }));
    const structuralPass = structuralResults.every((r) => r.pass);

    const semanticDetails: string[] = [];

    if (isImpl && this.workspaceRoot) {
      const codeFiles = this.findCodeFiles(this.workspaceRoot);
      if (codeFiles.length > 0) {
        semanticDetails.push(
          `(info) Implementation step touched ${codeFiles.length} candidate code file(s).`,
        );
      }
    }

    const referenced = this.extractFileReferences(output);

    if (customValidators && this.workspaceRoot) {
      const ctx: ValidatorContext = {
        stepId,
        workspaceRoot: this.workspaceRoot,
        artifactFile: "",
        referencedFiles: referenced,
      };
      for (const v of customValidators) {
        try {
          const r = await v.validate(output, ctx);
          if (!r.passed) {
            for (const d of r.details) {
              semanticDetails.push(`[${v.name}] ${d}`);
            }
          }
        } catch (err: any) {
          semanticDetails.push(
            `[${v.name}] validator threw: ${err?.message ?? err}`,
          );
        }
      }
    }

    if (this.workspaceRoot) {
      for (const ref of referenced) {
        if (/^https?:/i.test(ref)) continue;
        if (ref.length < 4) continue;
        const abs = path.isAbsolute(ref)
          ? ref
          : path.join(this.workspaceRoot, ref);
        if (!fs.existsSync(abs)) {
          semanticDetails.push(
            `Referenced file not found on disk: ${ref}`,
          );
        }
      }
    }

    // Filter purely informational notes from semantic failures
    const blockingDetails = semanticDetails.filter(
      (d) => !d.startsWith("(info)"),
    );
    const semanticPass = blockingDetails.length === 0;

    let verdict: ReviewVerdict;
    if (!structuralPass) verdict = "fail";
    else if (!semanticPass && state.retriesRemaining > 0) verdict = "fail";
    else if (!semanticPass && state.retriesRemaining <= 0) verdict = "cascade";
    else verdict = "pass";

    const failedNames = structuralResults
      .filter((r) => !r.pass)
      .map((r) => `${r.name}: ${r.message}`);
    const summaryParts: string[] = [];
    if (failedNames.length) summaryParts.push(failedNames.join("; "));
    if (blockingDetails.length) summaryParts.push(blockingDetails.join("; "));
    const summary =
      summaryParts.join(" | ") ||
      (verdict === "pass"
        ? "Output passed all structural and semantic checks"
        : "Output failed review");

    return {
      verdict,
      reasons: [...failedNames, ...blockingDetails],
      reviewer: "auto",
      timestamp: new Date().toISOString(),
      metadata: {
        summary,
        structuralPass,
        semanticPass,
        details: blockingDetails,
      },
    };
  }

  private safeCheck(
    fn: (output: string) => boolean,
    output: string,
  ): boolean {
    try {
      return fn(output);
    } catch {
      return false;
    }
  }

  private defaultStructuralChecks(): StructuralCheck[] {
    return [
      {
        name: "file_exists",
        check: (o) => o.length > 0,
        failMessage: "Agent produced no output",
      },
      {
        name: "no_placeholders",
        check: (o) => !/\{\{.*?\}\}/.test(o),
        failMessage: "Output contains unresolved placeholders",
      },
      {
        name: "min_length",
        check: (o) => o.length >= 10,
        failMessage: "Output is too short (< 10 chars)",
      },
      {
        name: "has_content",
        check: (o) =>
          /^#{1,3}\s/m.test(o) || o.split("\n").length >= 3,
        failMessage: "Output lacks structure",
      },
    ];
  }

  private implementationChecks(): StructuralCheck[] {
    return [
      {
        name: "file_exists",
        check: (o) => o.length > 0,
        failMessage: "Agent produced no build summary",
      },
      {
        name: "no_placeholders",
        check: (o) => !/\{\{.*?\}\}/.test(o),
        failMessage: "Output contained unresolved placeholders",
      },
    ];
  }

  private findCodeFiles(workspaceRoot: string): string[] {
    const out: string[] = [];
    const walk = (current: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(path.join(current, entry.name));
        } else if (entry.isFile()) {
          if (CODE_EXTENSIONS.some((e) => entry.name.endsWith(e))) {
            out.push(entry.name);
          }
        }
      }
    };
    walk(workspaceRoot);
    return out;
  }

  private extractFileReferences(output: string): string[] {
    const seen = new Set<string>();
    const patterns = [
      /file[:\s]+"?([^\s"']+\.\w+)"?/gi,
      /`([^\s`]+\.[a-z]+)`/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(output)) !== null) {
        const ref = m[1];
        if (!ref) continue;
        if (/^https?:/i.test(ref)) continue;
        if (ref.length < 4) continue;
        seen.add(ref);
      }
    }
    return Array.from(seen);
  }
}
