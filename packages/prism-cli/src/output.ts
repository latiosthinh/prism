import chalk from "chalk";

export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  muted: chalk.gray,
  bold: chalk.bold,
  dim: chalk.dim,
};

export function banner(): void {
  console.log("");
  console.log(colors.bold(colors.primary("  PRISM CLI ")) + colors.dim("v0.2 — Interactive Pipeline Agent"));
  console.log(colors.dim("  Type /help for commands, or just start chatting."));
  console.log("");
}

export function statusLine(config: { backend: string; model: string; workspace: string }): void {
  console.log(colors.dim(`  Workspace: ${config.workspace}`));
  console.log(colors.dim(`  Backend:   ${config.backend} / ${config.model}`));
  console.log("");
}

export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0))
  );

  const headerLine = headers
    .map((h, i) => colors.bold(h.padEnd(widths[i])))
    .join("  ");
  console.log(headerLine);
  console.log(colors.dim("─".repeat(headerLine.length)));

  for (const row of rows) {
    const line = row
      .map((cell, i) => cell.padEnd(widths[i]))
      .join("  ");
    console.log(line);
  }
}

export function stepStatus(stepId: string, name: string, status: string, revision?: number): void {
  const icon = statusIcon(status);
  const label = revision && revision > 1 ? ` (R${revision})` : "";
  console.log(`  ${icon} ${stepId.padEnd(20)} ${colors.dim(name)}${label}  ${colors.dim(status)}`);
}

function statusIcon(status: string): string {
  switch (status) {
    case "approved": return colors.success("✓");
    case "failed": return colors.error("✗");
    case "running": return colors.primary("⟳");
    case "pending": return colors.dim("○");
    case "in_review": return colors.warning("◉");
    case "rejected": return colors.error("✗");
    case "skipped": return colors.dim("⊘");
    case "resumed": return colors.muted("»");
    default: return "·";
  }
}

export function prompt(): string {
  return colors.primary("> ") + "";
}

export function error(msg: string): void {
  console.log(colors.error(`  ✗ ${msg}`));
}

export function success(msg: string): void {
  console.log(colors.success(`  ✓ ${msg}`));
}

export function info(msg: string): void {
  console.log(colors.dim(`  ${msg}`));
}

export function divider(): void {
  console.log(colors.dim("  " + "─".repeat(60)));
}
