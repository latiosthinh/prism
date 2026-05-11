import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface FileContext {
  path: string;
  content: string;
  status: "modified" | "added" | "deleted" | "unmodified";
}

export interface CodebaseContext {
  diff: string;
  changedFiles: FileContext[];
  relevantFiles: FileContext[];
  summary: string;
}

interface GitDiffEntry {
  path: string;
  status: "modified" | "added" | "deleted";
}

const MAX_FILE_SIZE = 50_000;
const MAX_CONTEXT_FILES = 20;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".PRISM",
  "dist",
  "build",
  ".next",
  ".output",
  "coverage",
  ".cache",
]);

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".toml",
  ".sql",
  ".sh",
  ".bash",
]);

export async function buildCodebaseContext(
  cwd: string,
  options?: {
    baseRef?: string;
    maxFiles?: number;
    includeUntracked?: boolean;
  },
): Promise<CodebaseContext> {
  const baseRef = options?.baseRef ?? "HEAD";
  const maxFiles = options?.maxFiles ?? MAX_CONTEXT_FILES;

  const changedFiles = getChangedFiles(cwd, baseRef, options?.includeUntracked);
  const diff = getDiff(cwd, baseRef);

  const fileContexts: FileContext[] = [];
  for (const file of changedFiles.slice(0, maxFiles)) {
    const fullPath = path.join(cwd, file.path);
    if (file.status === "deleted") {
      fileContexts.push({
        path: file.path,
        content: "",
        status: "deleted",
      });
      continue;
    }

    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      fileContexts.push({
        path: file.path,
        content,
        status: file.status,
      });
    } catch {
      /* skip unreadable files */
    }
  }

  const relevantFiles = filterRelevantFiles(fileContexts);

  const summary = buildSummary(changedFiles, relevantFiles);

  return {
    diff,
    changedFiles: fileContexts,
    relevantFiles,
    summary,
  };
}

function getChangedFiles(
  cwd: string,
  baseRef: string,
  includeUntracked = false,
): GitDiffEntry[] {
  try {
    let diffOutput = "";
    try {
      diffOutput = execSync(
        `git diff --name-status ${baseRef} -- .`,
        { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch {
      /* no committed changes */
    }

    const entries: GitDiffEntry[] = [];
    for (const line of diffOutput.trim().split("\n").filter(Boolean)) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const statusChar = parts[0];
      const filePath = parts[1];

      if (shouldSkipFile(filePath)) continue;

      let status: GitDiffEntry["status"];
      if (statusChar === "A" || statusChar === "M" || statusChar === "R") {
        status = "modified";
      } else if (statusChar === "D") {
        status = "deleted";
      } else {
        status = "modified";
      }

      entries.push({ path: filePath, status });
    }

    if (includeUntracked) {
      try {
        const untrackedOutput = execSync(
          "git ls-files --others --exclude-standard",
          { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
        for (const line of untrackedOutput.trim().split("\n").filter(Boolean)) {
          if (shouldSkipFile(line)) continue;
          entries.push({ path: line, status: "added" });
        }
      } catch {
        /* not a git repo or no untracked files */
      }
    }

    return entries;
  } catch {
    return [];
  }
}

function getDiff(cwd: string, baseRef: string): string {
  try {
    return execSync(
      `git diff ${baseRef} -- .`,
      { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1024 * 1024 },
    );
  } catch {
    return "";
  }
}

function shouldSkipFile(filePath: string): boolean {
  const parts = filePath.split("/");
  return parts.some((part) => SKIP_DIRS.has(part));
}

function filterRelevantFiles(files: FileContext[]): FileContext[] {
  return files.filter((f) => {
    if (f.status === "deleted") return false;
    const ext = path.extname(f.path).toLowerCase();
    return CODE_EXTENSIONS.has(ext);
  });
}

function buildSummary(
  changedFiles: GitDiffEntry[],
  relevantFiles: FileContext[],
): string {
  const added = changedFiles.filter((f) => f.status === "added").length;
  const modified = changedFiles.filter((f) => f.status === "modified").length;
  const deleted = changedFiles.filter((f) => f.status === "deleted").length;

  const lines: string[] = [];
  lines.push(`Changed files: ${changedFiles.length} total (${added} added, ${modified} modified, ${deleted} deleted)`);

  if (relevantFiles.length > 0) {
    lines.push("\nRelevant code files:");
    for (const f of relevantFiles.slice(0, 10)) {
      lines.push(`  - ${f.path} (${f.status})`);
    }
    if (relevantFiles.length > 10) {
      lines.push(`  ... and ${relevantFiles.length - 10} more`);
    }
  }

  return lines.join("\n");
}
