import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { OpenRouterConfig } from "@calos/core";
import type { AiQuotaConfig } from "./ai-quota.js";

function readValues(files: string[], environment: NodeJS.ProcessEnv) {
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
  return values;
}

function integerSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim();
  const parsed = Number(normalized);

  if (
    !/^\d+$/.test(normalized) ||
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`${name} debe ser un entero entre ${minimum} y ${maximum}`);
  }
  return parsed;
}

/** Server-only configuration. Never expose credentials to the browser. */
export function readOpenRouterConfig(
  files: string[],
  environment: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig | undefined {
  const values = readValues(files, environment);
  const apiKey = values.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    return undefined;
  }
  return {
    apiKey,
    model: values.OPENROUTER_MODEL?.trim() || "google/gemini-3-flash-preview",
  };
}

export function readAiQuotaConfig(
  files: string[],
  environment: NodeJS.ProcessEnv = process.env,
): AiQuotaConfig {
  const values = readValues(files, environment);
  return {
    maxRequests: integerSetting(
      values.CALOS_AI_REQUEST_LIMIT,
      30,
      1,
      1_000_000,
      "CALOS_AI_REQUEST_LIMIT",
    ),
    maxTokens: integerSetting(
      values.CALOS_AI_TOKEN_LIMIT,
      120_000,
      1,
      100_000_000,
      "CALOS_AI_TOKEN_LIMIT",
    ),
    periodHours: integerSetting(
      values.CALOS_AI_PERIOD_HOURS,
      24,
      1,
      720,
      "CALOS_AI_PERIOD_HOURS",
    ),
    imageTokenReserve: integerSetting(
      values.CALOS_AI_IMAGE_TOKEN_RESERVE,
      20_000,
      1,
      10_000_000,
      "CALOS_AI_IMAGE_TOKEN_RESERVE",
    ),
    maxOutputTokens: 4_000,
  };
}
