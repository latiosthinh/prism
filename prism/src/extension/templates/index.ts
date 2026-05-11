import * as fs from "fs";
import * as path from "path";

const TEMPLATES_DIR = path.join(__dirname);

export function loadTemplate(name: string): string {
  const filePath = path.join(TEMPLATES_DIR, `${name}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template '${name}' not found at ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export const TEMPLATE_NAMES = [
  "default",
  "feature-build",
  "code-review",
  "bug-fix",
  "full-stack-feature",
  "refactor",
  "prd-to-prototype",
  "blank",
] as const;

export type TemplateName = typeof TEMPLATE_NAMES[number];

export function loadAllTemplates(): Record<string, string> {
  const templates: Record<string, string> = {};
  for (const name of TEMPLATE_NAMES) {
    templates[name] = loadTemplate(name);
  }
  return templates;
}
