import { createProfile } from "./onboarding.js";
import { _electron, test as base, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { NutritionSnapshot } from "@calos/core";
const require = createRequire(import.meta.url);

type ProviderReply = { name: string; content?: unknown; status?: number };

type ProviderRequest = {
  response_format: { json_schema: { name: string } };
  messages: { role: string; content: string }[];
};

type ProviderState = {
  replies: ProviderReply[];
  requests: ProviderRequest[];
  unexpected: string[];
};

declare global {
  var calosProvider: ProviderState;
}

class Desktop {
  app!: ElectronApplication;
  page!: Page;
  private launches = 0;

  constructor(
    readonly directory: string,
    private readonly outputPath: (name: string) => string,
    private readonly autoOnboard = true,
  ) {}

  async launch(apiKey = "e2e-fake-key") {
    const bootstrap = join(this.directory, "bootstrap.mjs");
    const entry = pathToFileURL(resolve("out/main/index.js")).href;
    // Bootstrap lives outside the shipped app. Set paths before store construction
    // and block all main-process network requests before loading application code.
    await writeFile(
      bootstrap,
      `import { app } from "electron";
app.setPath("userData", ${JSON.stringify(this.directory)});
app.setPath("sessionData", ${JSON.stringify(this.directory)});
globalThis.calosProvider = { replies: [], requests: [], unexpected: [] };
globalThis.fetch = async (url, options) => {
  const state = globalThis.calosProvider;
  const request = JSON.parse(options?.body || "{}");
  state.requests.push(request);
  const reply = state.replies.shift();
  if (String(url) !== "https://openrouter.ai/api/v1/chat/completions" || !reply || reply.name !== request.response_format?.json_schema?.name) {
    state.unexpected.push(String(url));
    throw new Error("Unexpected provider request");
  }
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply.content) } }] }), { status: reply.status || 200 });
};
await import(${JSON.stringify(entry)});
`,
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (item): item is [string, string] => item[1] !== undefined,
      ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_RENDERER_URL;
    this.app = await _electron.launch({
      executablePath: require("electron") as string,
      args: [
        "--no-sandbox",
        ...(process.platform === "linux" ? ["--ozone-platform=x11"] : []),
        bootstrap,
      ],
      env: {
        ...env,
        CALOS_ENV_FILE: join(this.directory, "absent.env"),
        OPENROUTER_API_KEY: apiKey,
        OPENROUTER_MODEL: "e2e-model",
      },
    });
    await this.app.context().tracing.start({ screenshots: true, snapshots: true });
    this.page = await this.app.firstWindow();
    await expect(this.page.locator(".app-shell, .onboarding")).toBeVisible();
    if (
      this.autoOnboard &&
      (await this.page.getByRole("heading", { name: "Crea tu perfil" }).isVisible())
    ) {
      await createProfile(this.page);
    }
    if (this.autoOnboard) {
      await expect(
        this.page.getByRole("heading", { name: "Lo que has comido" }),
      ).toBeVisible();
    }
  }

  async mock(replies: ProviderReply[]) {
    await this.app.evaluate((_electron, values) => {
      globalThis.calosProvider.replies.push(...values);
    }, replies);
  }

  async requests() {
    return this.app.evaluate(() => globalThis.calosProvider.requests);
  }

  async snapshot(name?: string): Promise<NutritionSnapshot> {
    const registry = JSON.parse(
      await readFile(join(this.directory, "profiles.json"), "utf8"),
    );
    const id = name
      ? registry.profiles.find((profile: { name: string }) => profile.name === name)?.id
      : registry.activeId;
    return JSON.parse(
      await readFile(join(this.directory, "profiles", id, "nutrition.json"), "utf8"),
    );
  }

  async close() {
    if (!this.app || this.app.process().exitCode !== null) {
      return;
    }
    try {
      const state = await this.app.evaluate(() => globalThis.calosProvider);
      expect(state.unexpected, "Requests must match the simulated provider").toEqual(
        [],
      );
      expect(state.replies, "All simulated responses must be consumed").toEqual([]);
    } finally {
      try {
        await this.app.context().tracing.stop({
          path: this.outputPath(`trace-${++this.launches}.zip`),
        });
      } finally {
        await this.app.close();
      }
    }
  }

  async restart() {
    await this.close();
    await this.launch();
  }
}

export const test = base.extend<{ desktop: Desktop; autoOnboard: boolean }>({
  autoOnboard: [true, { option: true }],
  desktop: async ({ autoOnboard }, use, testInfo) => {
    const directory = await mkdtemp(join(tmpdir(), "calos-e2e-"));
    const desktop = new Desktop(
      directory,
      (name) => testInfo.outputPath(name),
      autoOnboard,
    );

    try {
      await desktop.launch();
      await use(desktop);
    } finally {
      try {
        try {
          if (
            testInfo.status !== testInfo.expectedStatus &&
            desktop.page &&
            !desktop.page.isClosed()
          ) {
            await testInfo.attach("failure", {
              body: await desktop.page.screenshot(),
              contentType: "image/png",
            });
          }
        } finally {
          await desktop.close();
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
});
export { expect };
