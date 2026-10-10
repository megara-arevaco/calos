import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createApi, profilesAt } from "../../api/src/server.js";
import type { ProviderState } from "./fixtures.js";

export type WebStorage = Awaited<ReturnType<BrowserContext["storageState"]>>;

export class WebRuntime {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  private server!: Server;
  private originalFetch = globalThis.fetch;
  readonly provider: ProviderState = { replies: [], requests: [], unexpected: [] };

  async launch(
    directory: string,
    apiKey: string,
    storage?: WebStorage,
    aiQuota?: { maxRequests?: number; maxTokens?: number; periodHours?: number },
  ) {
    globalThis.fetch = async (input, options) => {
      const request = JSON.parse(String(options?.body || "{}"));
      this.provider.requests.push(request);
      const reply = this.provider.replies.shift();

      if (
        String(input) !== "https://openrouter.ai/api/v1/chat/completions" ||
        !reply ||
        reply.name !== request.response_format?.json_schema?.name
      ) {
        this.provider.unexpected.push(String(input));
        throw new Error("Unexpected provider request");
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(reply.content) },
            },
          ],
        }),
        { status: reply.status || 200 },
      );
    };
    const api = await createApi({
      profiles: profilesAt(directory),
      usagePath: resolve(directory, "ai-usage.json"),
      aiQuota: aiQuota ?? { maxTokens: 1_000_000 },
      openRouterConfig: apiKey ? { apiKey, model: "e2e-model" } : undefined,
    });
    const root = resolve("dist");
    this.server = createServer(async (request, response) => {
      if (request.url?.startsWith("/api/")) {
        api.emit("request", request, response);
        return;
      }

      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const target = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);

      if (!target.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const types: Record<string, string> = {
          js: "text/javascript",
          css: "text/css",
          html: "text/html",
          svg: "image/svg+xml",
          png: "image/png",
        };
        response.setHeader(
          "Content-Type",
          types[target.split(".").pop()!] ?? "application/octet-stream",
        );
        response.end(await readFile(target));
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((ready) => this.server.listen(0, "127.0.0.1", ready));
    const address = this.server.address();

    if (!address || typeof address === "string") {
      throw new Error("No se ha podido iniciar el servidor E2E");
    }
    this.browser = await chromium.launch();
    const origin = `http://127.0.0.1:${address.port}`;
    this.context = await this.browser.newContext({
      storageState: storage
        ? {
            cookies: [],
            origins: [{ origin, localStorage: storage.origins[0]?.localStorage ?? [] }],
          }
        : undefined,
    });
    await this.context.tracing.start({ screenshots: true, snapshots: true });
    this.page = await this.context.newPage();
    await this.page.goto(origin);
  }

  async close(tracePath: string) {
    try {
      if (this.context) {
        await this.context.tracing.stop({ path: tracePath });
      }
    } finally {
      await this.browser?.close();
      if (this.server) {
        await new Promise<void>((done) => this.server.close(() => done()));
      }
      globalThis.fetch = this.originalFetch;
    }
  }
}
