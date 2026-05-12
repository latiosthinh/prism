import * as fs from "fs";
import * as path from "path";
import type { AuditEvent } from "./audit-events.js";

export function appendAudit(runDir: string, event: AuditEvent): void {
  const filePath = path.join(runDir, "decisions.jsonl");
  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(filePath, line, "utf8");
}

export function readAuditLog(runDir: string): AuditEvent[] {
  const filePath = path.join(runDir, "decisions.jsonl");
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const events: AuditEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      console.warn(`[audit] Skipping malformed line: ${line.slice(0, 100)}`);
    }
  }

  return events;
}

export function ensureRunDir(runDir: string): void {
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
}
