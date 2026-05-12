import * as fs from "fs";
import * as crypto from "crypto";
import { readAuditLog } from "../audit-writer.js";
import type { AuditEvent } from "../audit-events.js";

export function exportAuditMarkdown(runDir: string): string {
  const events = readAuditLog(runDir);

  const runStart = events.find((e) => e.type === "run_start");
  const runDone = events.find((e) => e.type === "run_done");
  const runAborted = events.find((e) => e.type === "run_aborted");
  const stepDones = events.filter((e) => e.type === "step_done");
  const stepStarts = events.filter((e) => e.type === "step_start");
  const gateCloses = events.filter((e) => e.type === "gate_closed");
  const budgetWarns = events.filter((e) => e.type === "budget_warn");
  const budgetExceeded = events.filter((e) => e.type === "budget_exceeded");

  const pipeline = (runStart as any)?.pipeline ?? "Unknown";
  const runId = (runStart as any)?.runId ?? "unknown";
  const budgetUsd = (runStart as any)?.budgetUsd ?? 0;
  const totalCost = (runDone as any)?.totalCost ?? 0;
  const totalTokens = (runDone as any)?.totalTokens ?? 0;
  const durationMs = (runDone as any)?.durationMs ?? 0;
  const exitStatus = runDone ? (runDone as any).exitStatus : runAborted ? "aborted" : "incomplete";

  const startTime = runStart ? new Date((runStart as any).ts).toISOString() : "N/A";
  const endTime = runDone ? new Date((runDone as any).ts).toISOString() : runAborted ? new Date((runAborted as any).ts).toISOString() : "N/A";

  const lines: string[] = [];

  lines.push(`# PRISM Run Report`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Run ID | \`${runId}\` |`);
  lines.push(`| Pipeline | ${pipeline} |`);
  lines.push(`| Started | ${startTime} |`);
  lines.push(`| Ended | ${endTime} |`);
  lines.push(`| Duration | ${formatDuration(durationMs)} |`);
  lines.push(`| Total Cost | $${totalCost.toFixed(6)} |`);
  lines.push(`| Total Tokens | ${totalTokens.toLocaleString()} |`);
  lines.push(`| Budget | $${budgetUsd.toFixed(2)} |`);
  if (budgetUsd > 0) {
    lines.push(`| Budget Consumed | ${((totalCost / budgetUsd) * 100).toFixed(1)}% |`);
  }
  lines.push(`| Status | ${exitStatus} |`);
  lines.push("");

  if (exitStatus === "incomplete" || exitStatus === "aborted") {
    lines.push("> **Warning:** Run did not complete normally.");
    lines.push("");
  }

  lines.push(`## Step Summary`);
  lines.push("");
  lines.push(`| Step | Agent | Model | Duration | Tokens | Cost | Status |`);
  lines.push(`|---|---|---|---|---|---|---|`);

  for (const start of stepStarts) {
    const stepId = (start as any).stepId;
    const agent = (start as any).agent;
    const model = (start as any).model;
    const done = stepDones.find((d) => (d as any).stepId === stepId);
    const duration = done ? (done as any).durationMs : 0;
    const tokensIn = done ? (done as any).tokensIn : 0;
    const tokensOut = done ? (done as any).tokensOut : 0;
    const cost = done ? (done as any).costUsd : 0;
    const status = done ? "done" : "pending";

    lines.push(`| ${stepId} | ${agent} | ${model} | ${formatDuration(duration)} | ${(tokensIn + tokensOut).toLocaleString()} | $${cost.toFixed(6)} | ${status} |`);
  }

  lines.push("");

  if (gateCloses.length > 0) {
    lines.push(`## Gate Decisions`);
    lines.push("");
    for (const gate of gateCloses) {
      const stepId = (gate as any).stepId;
      const decision = (gate as any).decision;
      const comment = (gate as any).userComment ?? "";
      const waitMs = (gate as any).waitDurationMs ?? 0;
      lines.push(`- **${stepId}**: **${decision.toUpperCase()}** (waited ${formatDuration(waitMs)})${comment ? ` — "${comment}"` : ""}`);
    }
    lines.push("");
  }

  lines.push(`## Budget Events`);
  lines.push("");
  if (budgetWarns.length === 0 && budgetExceeded.length === 0) {
    lines.push("No budget events.");
  } else {
    for (const warn of budgetWarns) {
      lines.push(`- **Warning** at ${(warn as any).ts}: spent $${(warn as any).spentUsd.toFixed(4)} of $${(warn as any).budgetUsd.toFixed(2)} (${(warn as any).pct.toFixed(0)}%)`);
    }
    for (const exceeded of budgetExceeded) {
      lines.push(`- **Exceeded** at ${(exceeded as any).ts}: spent $${(exceeded as any).spentUsd.toFixed(4)} of $${(exceeded as any).budgetUsd.toFixed(2)}`);
    }
  }
  lines.push("");

  const filePath = `${runDir}/decisions.jsonl`;
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    lines.push(`## Integrity`);
    lines.push("");
    lines.push(`SHA-256: \`${hash}\``);
    lines.push("");
    lines.push(`Verify: \`shasum -a 256 decisions.jsonl\``);
  }

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
