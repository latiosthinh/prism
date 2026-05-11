export interface UserFriendlyError {
  title: string;
  message: string;
  suggestion?: string;
  category: "provider" | "pipeline" | "runner" | "gate" | "system";
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  error: UserFriendlyError;
}> = [
  // Provider errors
  {
    pattern: /api.?key|unauthorized|authentication|invalid.*key/i,
    error: {
      title: "API Key Invalid",
      message: "The API key for the selected provider is missing or invalid.",
      suggestion: "Open PRISM Settings → add or update your API key. Keys are stored securely in VS Code SecretStorage.",
      category: "provider",
    },
  },
  {
    pattern: /rate.?limit|too many requests/i,
    error: {
      title: "Rate Limit Exceeded",
      message: "The AI provider is temporarily limiting requests.",
      suggestion: "Wait a few minutes and try again, or switch to a different provider in PRISM Settings.",
      category: "provider",
    },
  },
  {
    pattern: /model.*not.*(found|available|supported)|unknown.*model/i,
    error: {
      title: "Model Unavailable",
      message: "The requested AI model is not available for your account or provider.",
      suggestion: "Try changing the model in pipeline YAML or PRISM Settings. Check your provider's documentation for available models.",
      category: "provider",
    },
  },
  {
    pattern: /insufficient.*quota|billing|quota.*exceeded/i,
    error: {
      title: "Quota Exceeded",
      message: "Your provider account has reached its usage quota or billing limit.",
      suggestion: "Check your provider's billing dashboard. Consider upgrading your plan or switching providers.",
      category: "provider",
    },
  },
  {
    pattern: /402|429|503|timeout|econnrefused|econnreset|enotfound/i,
    error: {
      title: "Provider Connection Error",
      message: "Could not connect to the AI provider's API.",
      suggestion: "Check your internet connection. The provider may be experiencing downtime — check their status page.",
      category: "provider",
    },
  },

  // Pipeline errors
  {
    pattern: /cycle|circular.*depend/i,
    error: {
      title: "Dependency Cycle Detected",
      message: "Your pipeline has a circular dependency where steps depend on each other in a loop.",
      suggestion: "Open the pipeline in the DAG editor and remove or rearrange circular dependencies.",
      category: "pipeline",
    },
  },
  {
    pattern: /unknown.*agent|agent.*not.*found|unregistered.*agent/i,
    error: {
      title: "Unknown Agent",
      message: "A pipeline step references an agent that doesn't exist in the agent registry.",
      suggestion: "Add the agent to .prism/agents/ or use one of the built-in agents: executor, architect, critic, etc.",
      category: "pipeline",
    },
  },
  {
    pattern: /unknown.*step|depends.*on.*unknown|not.*exist/i,
    error: {
      title: "Invalid Dependency",
      message: "A step depends_on a step that doesn't exist in the pipeline.",
      suggestion: "Check the depends_on field in your pipeline YAML. Step IDs must match exactly.",
      category: "pipeline",
    },
  },
  {
    pattern: /yaml|parse|syntax/i,
    error: {
      title: "Invalid YAML",
      message: "The pipeline YAML file has a syntax error.",
      suggestion: "Check the pipeline YAML file for indentation issues, missing colons, or invalid field names. Run 'PRISM: Dry-Run Pipeline' to validate.",
      category: "pipeline",
    },
  },

  // Runner errors
  {
    pattern: /command.*blocked|not.*allowed/i,
    error: {
      title: "Command Blocked",
      message: "An agent tried to execute a shell command that is not in the allowed commands list.",
      suggestion: "Review the command. If it's safe, add it to prism.allowedCommands in PRISM Settings.",
      category: "runner",
    },
  },
  {
    pattern: /file.*not.*found|enoent/i,
    error: {
      title: "File Not Found",
      message: "An agent tried to read or modify a file that doesn't exist.",
      suggestion: "Check that all referenced files exist in the workspace. The agent may have used an incorrect path.",
      category: "runner",
    },
  },
  {
    pattern: /permission.*denied|eacces/i,
    error: {
      title: "Permission Denied",
      message: "An agent tried to access a file or command without sufficient permissions.",
      suggestion: "Check file permissions in the workspace. Ensure the agent is not trying to access protected system files.",
      category: "runner",
    },
  },
  {
    pattern: /timeout|timed.*out/i,
    error: {
      title: "Command Timeout",
      message: "A shell command executed by an agent took too long and was terminated.",
      suggestion: "The command may be stuck or performing too much work. Try simplifying the task or increasing the timeout.",
      category: "runner",
    },
  },

  // Gate errors
  {
    pattern: /approval.*timeout|gate.*timeout/i,
    error: {
      title: "Gate Approval Timeout",
      message: "The gate approval window timed out before a decision was made.",
      suggestion: "Pay attention to gate prompts when they appear. You can resume the pipeline from any step.",
      category: "gate",
    },
  },
  {
    pattern: /auto.?approve|yolo/i,
    error: {
      title: "Auto-approve Warning",
      message: "Gates are being auto-approved without human review.",
      suggestion: "Disable 'Auto-approve gates' in PRISM Settings if you want manual review at each gate.",
      category: "gate",
    },
  },
];

export function toFriendlyError(raw: string): UserFriendlyError {
  for (const { pattern, error } of ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return error;
    }
  }
  return {
    title: "Unexpected Error",
    message: raw.length > 200 ? raw.slice(0, 200) + "..." : raw,
    suggestion: "Check the PRISM output log for details. Report this issue on GitHub if it persists.",
    category: "system",
  };
}

export function formatErrorMessage(raw: string): string {
  const friendly = toFriendlyError(raw);
  const parts: string[] = [
    friendly.title,
    friendly.message,
  ];
  if (friendly.suggestion) {
    parts.push(`→ ${friendly.suggestion}`);
  }
  return parts.join("\n");
}
