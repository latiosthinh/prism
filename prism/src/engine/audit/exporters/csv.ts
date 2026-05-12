import { readAuditLog } from "../audit-writer.js";
import type { AuditEvent } from "../audit-events.js";

export function exportAuditCsv(runDir: string): string {
  const events = readAuditLog(runDir);

  const stepDones = events.filter((e) => e.type === "step_done");
  const stepStarts = events.filter((e) => e.type === "step_start");
  const runStart = events.find((e) => e.type === "run_start");

  const pipeline = (runStart as any)?.pipeline ?? "Unknown";
  const runId = (runStart as any)?.runId ?? "unknown";

  const header = "run_id,pipeline,step_id,agent,model,provider,started_at_iso,completed_at_iso,duration_ms,tokens_in,tokens_out,tokens_cached,cost_usd,status,artifact_path";
  const rows: string[] = [header];

  let totalDuration = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalTokensCached = 0;
  let totalCost = 0;

  for (const done of stepDones) {
    const stepId = (done as any).stepId;
    const start = stepStarts.find((s) => (s as any).stepId === stepId);
    const agent = start ? (start as any).agent : "unknown";
    const model = start ? (start as any).model : "unknown";
    const provider = start ? (start as any).provider : "unknown";
    const duration = (done as any).durationMs ?? 0;
    const tokensIn = (done as any).tokensIn ?? 0;
    const tokensOut = (done as any).tokensOut ?? 0;
    const tokensCached = (done as any).tokensCached ?? 0;
    const cost = (done as any).costUsd ?? 0;
    const artifactPath = (done as any).artifactPath ?? "";

    const startedAt = start ? new Date((start as any).ts).toISOString() : "";
    const completedAt = new Date((done as any).ts).toISOString();

    totalDuration += duration;
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;
    totalTokensCached += tokensCached;
    totalCost += cost;

    rows.push(`${runId},${pipeline},${stepId},${agent},${model},${provider},${startedAt},${completedAt},${duration},${tokensIn},${tokensOut},${tokensCached},${cost.toFixed(6)},done,${artifactPath}`);
  }

  rows.push(`TOTAL,,,,,,,${totalDuration},${totalTokensIn},${totalTokensOut},${totalTokensCached},${totalCost.toFixed(6)},,`);

  return rows.join("\n");
}
