import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "./fixtures.js";

interface ApiProcess {
  child: ChildProcess;
  stderr: string;
}

async function postRpc(
  page: import("@playwright/test").Page,
  channel: string,
  args: unknown[],
) {
  return page.evaluate(
    async ({ channel, args }) => {
      const response = await fetch(`/api/rpc/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return { status: response.status, body: await response.json() };
    },
    { channel, args },
  );
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("No se ha podido reservar un puerto E2E");
  }
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}

function startApi(
  directory: string,
  port: number,
  extra: Record<string, string> = {},
): ApiProcess {
  const child = spawn(
    process.execPath,
    [resolve(import.meta.dirname, "../../api/dist/start.js")],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "",
        CALOS_DATA_DIR: directory,
        CALOS_ENV_FILE: join(directory, "e2e-no-provider.env"),
        HOST: "127.0.0.1",
        PORT: String(port),
        ...extra,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const result: ApiProcess = { child, stderr: "" };
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    result.stderr += chunk;
  });
  return result;
}

function waitForExit(api: ApiProcess, timeoutMs = 8_000): Promise<number | null> {
  if (api.child.exitCode !== null) {
    return Promise.resolve(api.child.exitCode);
  }
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`La API no terminó a tiempo. stderr: ${api.stderr}`));
    }, timeoutMs);
    api.child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
  });
}

async function requestApi(port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolveResponse, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET", timeout: 500 },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolveResponse({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("timeout", () => request.destroy(new Error("API timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function waitForHealth(api: ApiProcess, port: number) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.child.exitCode !== null) {
      throw new Error(`La API terminó al iniciar. stderr: ${api.stderr}`);
    }
    try {
      const response = await requestApi(port, "/api/health");

      if (response.status === 200) {
        return;
      }
    } catch {
      await delay(50);
      continue;
    }
    await delay(50);
  }
  throw new Error(`La API no quedó lista. stderr: ${api.stderr}`);
}

async function stopApi(api: ApiProcess) {
  if (api.child.exitCode === null) {
    api.child.kill("SIGTERM");
    await waitForExit(api);
  }
}

test.use({ autoOnboard: false });

test("ledger corrupto o estructuralmente inválido falla cerrado y no se reescribe", async ({
  webApp,
}) => {
  await webApp.close();
  const ledgerPath = join(webApp.directory, "ai-usage.json");
  const badLedgers = [
    JSON.stringify({
      version: 2,
      periodStartedAt: new Date().toISOString(),
      requestsReserved: 0,
      tokensReserved: 0,
    }),
    JSON.stringify({
      version: 1,
      periodStartedAt: "fecha-inválida",
      requestsReserved: 0,
      tokensReserved: 0,
    }),
    JSON.stringify({
      version: 1,
      periodStartedAt: new Date().toISOString(),
      requestsReserved: -1,
      tokensReserved: 0,
    }),
    JSON.stringify({
      version: 1,
      periodStartedAt: new Date().toISOString(),
      requestsReserved: 0,
      tokensReserved: 9_007_199_254_740_992,
    }),
    JSON.stringify({
      version: 1,
      periodStartedAt: new Date().toISOString(),
      requestsReserved: 0,
      tokensReserved: 0,
      unexpected: true,
    }),
    "{ JSON roto",
  ];

  for (const content of badLedgers) {
    await writeFile(ledgerPath, content, "utf8");
    await webApp.launch();
    const status = await postRpc(webApp.page, "assistant:usage", []);
    expect(status.status).toBe(400);
    expect(status.body.error).toContain("registro local de cuota");
    const onboarding = await postRpc(webApp.page, "profiles:onboarding", [
      "Ayúdame a crear un perfil",
      [],
    ]);
    expect(onboarding.status).toBe(200);
    expect(onboarding.body.data.error).toBe(true);
    expect(await webApp.requests(true)).toEqual([]);
    await webApp.close();
    expect(await readFile(ledgerPath, "utf8")).toBe(content);
  }
});

test("configuración de cuota inválida impide arrancar la API sin dejar bloqueo", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-quota-config-e2e-"));

  try {
    const api = startApi(directory, await availablePort(), {
      CALOS_AI_TOKEN_LIMIT: "0",
    });
    const exitCode = await waitForExit(api);
    expect(exitCode).not.toBe(0);
    expect(api.stderr).toContain("CALOS_AI_TOKEN_LIMIT debe ser un entero entre 1");
    await expect(
      readFile(join(directory, ".calos-api.lock"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("una segunda API no puede compartir la raíz y el cierre permite reiniciar", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-quota-instance-e2e-"));
  let first: ApiProcess | undefined;
  let replacement: ApiProcess | undefined;

  try {
    const firstPort = await availablePort();
    first = startApi(directory, firstPort);
    await waitForHealth(first, firstPort);
    const lockPath = join(directory, ".calos-api.lock");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
      pid: number;
      token: string;
    };
    expect(lock).toMatchObject({ pid: first.child.pid });
    expect(lock.token).toBeTruthy();

    const second = startApi(directory, await availablePort());
    const secondExitCode = await waitForExit(second);
    expect(secondExitCode).not.toBe(0);
    expect(second.stderr).toContain("Calos API ya está activa");
    expect((await requestApi(firstPort, "/api/health")).status).toBe(200);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(lock);

    await stopApi(first);
    first = undefined;
    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const replacementPort = await availablePort();
    replacement = startApi(directory, replacementPort);
    await waitForHealth(replacement, replacementPort);
  } finally {
    if (first) {
      await stopApi(first);
    }
    if (replacement) {
      await stopApi(replacement);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
