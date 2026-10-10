import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AssistantError, openRouterJsonSchema } from "@calos/core";
import type { AssistantUsage, JsonCompletion, NutritionImage } from "@calos/core";

export interface AiQuotaConfig {
  maxRequests: number;
  maxTokens: number;
  periodHours: number;
  imageTokenReserve: number;
  maxOutputTokens: number;
}

export type AiQuotaStatus = AssistantUsage;

interface AiQuotaState {
  version: 1;
  periodStartedAt: string;
  requestsReserved: number;
  tokensReserved: number;
}

const defaults: AiQuotaConfig = {
  maxRequests: 30,
  maxTokens: 120_000,
  periodHours: 24,
  imageTokenReserve: 20_000,
  maxOutputTokens: 4_000,
};

const bounds: Record<keyof AiQuotaConfig, number> = {
  maxRequests: 1_000_000,
  maxTokens: 100_000_000,
  periodHours: 720,
  imageTokenReserve: 10_000_000,
  maxOutputTokens: 10_000_000,
};

const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;
const REQUEST_FRAMING_MARGIN_BYTES = 1_024;

export class AiQuotaError extends AssistantError {}

const locks = new Map<string, Promise<unknown>>();

async function withQuotaLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = resolve(filePath);
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validateState(value: unknown): AiQuotaState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiQuotaError(
      "El registro local de cuota está corrupto; no se ha enviado la solicitud.",
    );
  }

  const state = value as Record<string, unknown>;
  const keys = Object.keys(state).sort();

  if (
    keys.join(",") !==
      ["periodStartedAt", "requestsReserved", "tokensReserved", "version"].join(",") ||
    state.version !== 1 ||
    !isCanonicalIsoDate(state.periodStartedAt) ||
    !Number.isSafeInteger(state.requestsReserved) ||
    (state.requestsReserved as number) < 0 ||
    !Number.isSafeInteger(state.tokensReserved) ||
    (state.tokensReserved as number) < 0
  ) {
    throw new AiQuotaError(
      "El registro local de cuota está corrupto; no se ha enviado la solicitud.",
    );
  }
  return state as unknown as AiQuotaState;
}

async function readState(filePath: string): Promise<AiQuotaState | null> {
  let text: string;

  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  try {
    return validateState(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof AiQuotaError) {
      throw error;
    }
    throw new AiQuotaError(
      "El registro local de cuota no contiene JSON válido; no se ha enviado la solicitud.",
    );
  }
}

async function writeState(filePath: string, value: AiQuotaState) {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export class AiQuotaStore {
  readonly config: Readonly<AiQuotaConfig>;

  constructor(
    private readonly filePath: string,
    config: Partial<AiQuotaConfig> = {},
  ) {
    const resolved = { ...defaults, ...config };

    for (const key of Object.keys(bounds) as (keyof AiQuotaConfig)[]) {
      const value = resolved[key];

      if (!Number.isSafeInteger(value) || value < 1 || value > bounds[key]) {
        throw new Error(
          `La configuración ${key} debe ser un entero entre 1 y ${bounds[key]}`,
        );
      }
    }
    this.config = Object.freeze(resolved);
  }

  private async state(): Promise<AiQuotaState> {
    const state = await readState(this.filePath);

    if (state) {
      this.periodEnd(Date.parse(state.periodStartedAt));
      return state;
    }
    return {
      version: 1,
      periodStartedAt: new Date().toISOString(),
      requestsReserved: 0,
      tokensReserved: 0,
    };
  }

  private periodEnd(started: number): number {
    const end = started + this.config.periodHours * 3_600_000;

    if (!Number.isSafeInteger(end) || end < 0 || end > MAX_DATE_MILLISECONDS) {
      throw new AiQuotaError(
        "El periodo del registro local de cuota no es válido; no se ha enviado la solicitud.",
      );
    }
    return end;
  }

  private roll(state: AiQuotaState, now: number): AiQuotaState {
    const started = Date.parse(state.periodStartedAt);

    if (now - started >= this.config.periodHours * 3_600_000) {
      return {
        version: 1,
        periodStartedAt: new Date(now).toISOString(),
        requestsReserved: 0,
        tokensReserved: 0,
      };
    }
    return state;
  }

  private reservationTokens(
    name: string,
    schema: Parameters<JsonCompletion>[1],
    system: string,
    user: string,
    image?: NutritionImage,
  ): number {
    // Reserve at least one unit per serialized UTF-8 byte of context, then count
    // the actual structured-output schema/name and leave room for JSON framing.
    const contextBytes = Buffer.byteLength(
      JSON.stringify([name, system, user]),
      "utf8",
    );
    const schemaBytes = Buffer.byteLength(
      JSON.stringify(openRouterJsonSchema(name, schema)),
      "utf8",
    );
    const tokens =
      contextBytes +
      schemaBytes +
      REQUEST_FRAMING_MARGIN_BYTES +
      Math.max(this.config.maxOutputTokens, 4_000) +
      (image ? this.config.imageTokenReserve : 0);

    if (!Number.isSafeInteger(tokens)) {
      throw new AiQuotaError(
        "No se ha podido calcular una reserva segura de tokens; no se ha enviado la solicitud.",
      );
    }
    return tokens;
  }

  async reserve(
    name: string,
    schema: Parameters<JsonCompletion>[1],
    system: string,
    user: string,
    image?: NutritionImage,
  ): Promise<void> {
    await withQuotaLock(this.filePath, async () => {
      const now = Date.now();
      const previous = await this.state();
      const state = this.roll(previous, now);
      const tokens = this.reservationTokens(name, schema, system, user, image);

      if (state.requestsReserved >= this.config.maxRequests) {
        if (state !== previous) {
          await writeState(this.filePath, state);
        }
        throw new AiQuotaError(
          `Se alcanzó el límite local de ${this.config.maxRequests} solicitudes por periodo. La solicitud no se envió; puedes continuar manualmente o esperar al siguiente periodo.`,
        );
      }
      if (tokens > this.config.maxTokens - state.tokensReserved) {
        if (state !== previous) {
          await writeState(this.filePath, state);
        }
        throw new AiQuotaError(
          `La reserva estimada de ${tokens.toLocaleString("es-ES")} tokens superaría el límite local de ${this.config.maxTokens.toLocaleString("es-ES")} tokens por periodo. No se envió a OpenRouter; puedes continuar manualmente o esperar al siguiente periodo.`,
        );
      }
      state.requestsReserved += 1;
      state.tokensReserved += tokens;
      await writeState(this.filePath, state);
    });
  }

  async status(): Promise<AiQuotaStatus> {
    return withQuotaLock(this.filePath, async () => {
      const now = Date.now();
      const previous = await this.state();
      const state = this.roll(previous, now);

      if (state !== previous) {
        await writeState(this.filePath, state);
      }

      const started = Date.parse(state.periodStartedAt);
      return {
        scope: "this-calos-installation",
        periodStartedAt: state.periodStartedAt,
        periodEndsAt: new Date(this.periodEnd(started)).toISOString(),
        periodHours: this.config.periodHours,
        requestsReserved: state.requestsReserved,
        requestLimit: this.config.maxRequests,
        tokensReserved: state.tokensReserved,
        tokenLimit: this.config.maxTokens,
        imageTokenReserve: this.config.imageTokenReserve,
      };
    });
  }

  completion(complete: JsonCompletion): JsonCompletion {
    return async (name, schema, system, user, image) => {
      await this.reserve(name, schema, system, user, image);
      return complete(name, schema, system, user, image);
    };
  }
}
