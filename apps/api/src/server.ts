import { createServer } from "node:http";
import { LocalProfiles } from "@calos/core";
import type { ApiContext } from "./context.js";
import { createNutritionActions } from "./actions.js";
import { rpcContracts, type RpcChannel } from "@calos/core";

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export async function createApi(context: ApiContext) {
  await context.profiles.list();
  const actions = createNutritionActions(context);
  const allowedOrigins = (process.env.CALOS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .filter(Boolean);

  return createServer(async (request, response) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(value));
    };
    const origin = request.headers.origin;

    if (
      origin &&
      origin !== `http://${request.headers.host}` &&
      !allowedOrigins.includes(origin)
    ) {
      send(403, { ok: false, error: "Origen no autorizado" });
      request.resume();
      return;
    }
    if (request.method === "GET" && request.url === "/api/health") {
      try {
        await context.profiles.list();
        send(200, { ok: true });
      } catch {
        send(503, { ok: false, error: "Almacenamiento no disponible" });
      }
      return;
    }

    const channel = request.url?.startsWith("/api/rpc/") ? request.url.slice(9) : "";

    if (!Object.hasOwn(rpcContracts, channel)) {
      send(404, { ok: false, error: "Ruta desconocida" });
      request.resume();
      return;
    }
    if (request.method !== "POST") {
      send(405, { ok: false, error: "Método no permitido" });
      request.resume();
      return;
    }
    if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
      send(415, { ok: false, error: "Se requiere application/json" });
      request.resume();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;

    try {
      for await (const chunk of request) {
        size += chunk.length;

        if (size > MAX_REQUEST_BYTES) {
          send(413, { ok: false, error: "La petición supera el límite de 10 MiB" });
          return;
        }
        chunks.push(chunk);
      }

      let args: unknown;

      try {
        args = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        send(400, { ok: false, error: "JSON no válido" });
        return;
      }

      // JSON represents omitted tuple values as null.
      const parsed = rpcContracts[channel as RpcChannel].safeParse(
        Array.isArray(args)
          ? args.map((value) => (value === null ? undefined : value))
          : args,
      );

      if (!parsed.success) {
        send(400, { ok: false, error: `Argumentos no válidos para ${channel}` });
        return;
      }

      const action = actions[channel as RpcChannel] as (
        ...values: unknown[]
      ) => unknown;
      send(200, { ok: true, data: (await action(...parsed.data)) ?? null });
    } catch (error) {
      send(400, {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se ha podido completar la operación",
      });
    }
  });
}

export function profilesAt(directory: string) {
  return new LocalProfiles(directory);
}
