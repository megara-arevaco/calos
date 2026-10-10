import { z } from "zod";
import type { NutritionImage } from "./types.js";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

export class AssistantError extends Error {}

export type JsonCompletion = <T>(
  name: string,
  schema: z.ZodType<T>,
  system: string,
  user: string,
  image?: NutritionImage,
) => Promise<T>;

// Gemini's constrained decoder can reject bounded, nested schemas as too complex.
// Keep shape/nullability/enums on the wire; enforce all bounds with Zod on receipt.
const localConstraints = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);

function transportSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(transportSchema);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !localConstraints.has(key))
        .map(([key, child]) => [key, transportSchema(child)]),
    );
  }
  return value;
}

export function openRouterJsonSchema(name: string, schema: z.ZodType) {
  return {
    name,
    strict: true,
    schema: transportSchema(z.toJSONSchema(schema)),
  };
}

export function createOpenRouterClient(
  config: OpenRouterConfig,
  fetcher: typeof fetch = fetch,
): JsonCompletion {
  return async (name, schema, system, user, image) => {
    let response: Response;

    try {
      response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "Calos",
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          max_tokens: 4000,
          provider: { require_parameters: true },
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: image
                ? [
                    { type: "text", text: user },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${image.mimeType};base64,${image.base64}`,
                      },
                    },
                  ]
                : user,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: openRouterJsonSchema(name, schema),
          },
        }),
      });
    } catch {
      throw new AssistantError(
        "No se ha podido conectar con OpenRouter. Comprueba tu conexión e inténtalo de nuevo.",
      );
    }
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "OpenRouter ha rechazado la clave. Revisa OPENROUTER_API_KEY."
          : response.status === 402
            ? "No hay saldo suficiente en OpenRouter."
            : response.status === 429
              ? "OpenRouter ha alcanzado el límite de peticiones. Prueba dentro de un momento."
              : response.status === 400 || response.status === 404
                ? "Revisa OPENROUTER_MODEL: debe existir y admitir respuestas JSON estructuradas."
                : "OpenRouter no está disponible en este momento. Prueba de nuevo.";
      throw new AssistantError(message);
    }
    try {
      const body = await response.json();
      const choice = body.choices?.[0];

      if (
        body.error ||
        choice?.finish_reason !== "stop" ||
        typeof choice?.message?.content !== "string"
      ) {
        throw new Error("Incomplete reply");
      }
      return schema.parse(JSON.parse(choice.message.content));
    } catch {
      throw new AssistantError(
        "El modelo no ha devuelto una respuesta válida. No se ha guardado ninguna comida; prueba de nuevo.",
      );
    }
  };
}
