import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { OpenRouterConfig } from "@calos/core";

/** Read only in Electron's main process. Never expose credentials through IPC or Vite. */
export function readOpenRouterConfig(
  files: string[],
  environment: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig | undefined {
  const values: Record<string, string | undefined> = {};

  for (const file of files) {
    try {
      Object.assign(values, parseEnv(readFileSync(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  Object.assign(values, environment);
  const apiKey = values.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }
  return {
    apiKey,
    model: values.OPENROUTER_MODEL?.trim() || "google/gemini-3-flash-preview",
  };
}
