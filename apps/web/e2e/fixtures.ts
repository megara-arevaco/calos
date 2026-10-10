import { WebRuntime, type WebStorage } from "./web-runtime.js";
import { createProfile, registerOnboardingProvider } from "./onboarding.js";
import { test as base, expect, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NutritionSnapshot } from "@calos/core";

type ProviderReply = { name: string; content?: unknown; status?: number };

type ProviderRequest = {
  response_format: { json_schema: { name: string } };
  messages: { role: string; content: string }[];
};

export type ProviderState = {
  replies: ProviderReply[];
  requests: ProviderRequest[];
  unexpected: string[];
};

class WebApp {
  page!: Page;
  private launches = 0;
  private runtime?: WebRuntime;
  private storage?: WebStorage;
  private quota?: { maxRequests?: number; maxTokens?: number; periodHours?: number };
  constructor(
    readonly directory: string,
    private readonly outputPath: (name: string) => string,
    private readonly autoOnboard = true,
  ) {}
  async launch(
    apiKey = "e2e-fake-key",
    quota?: { maxRequests?: number; maxTokens?: number; periodHours?: number },
  ) {
    this.quota = quota ?? this.quota;
    this.runtime = new WebRuntime();
    await this.runtime.launch(this.directory, apiKey, this.storage, this.quota);
    this.page = this.runtime.page;
    registerOnboardingProvider(this.page, (replies) => this.mock(replies));
    await expect(this.page.locator(".app-shell, .onboarding")).toBeVisible();
    if (
      this.autoOnboard &&
      (await this.page
        .getByRole("region", { name: "Crear tu perfil", exact: true })
        .isVisible())
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
    if (!this.runtime) {
      throw new Error("La aplicación no está arrancada");
    }
    this.runtime.provider.replies.push(...replies);
  }
  async requests(includeOnboarding = false) {
    const requests = this.runtime?.provider.requests ?? [];
    return includeOnboarding
      ? requests
      : requests.filter(
          (request) =>
            request.response_format.json_schema.name !== "profile_onboarding",
        );
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
    if (!this.runtime) {
      return;
    }

    const runtime = this.runtime;
    this.runtime = undefined;
    try {
      expect(runtime.provider.unexpected).toEqual([]);
      expect(runtime.provider.replies).toEqual([]);
      if (runtime.context) {
        this.storage = await runtime.context.storageState();
      }
    } finally {
      await runtime.close(this.outputPath(`trace-${++this.launches}.zip`));
    }
  }
  async newBrowserPage() {
    if (!this.runtime) {
      throw new Error("La aplicación no está arrancada");
    }

    const context = await this.runtime.browser.newContext();
    const page = await context.newPage();
    registerOnboardingProvider(page, (replies) => this.mock(replies));
    await page.goto(this.page.url());
    return page;
  }
  async restart() {
    await this.close();
    await this.launch();
  }
}

export const test = base.extend<{ webApp: WebApp; autoOnboard: boolean }>({
  autoOnboard: [true, { option: true }],
  webApp: async ({ autoOnboard }, use, testInfo) => {
    const directory = await mkdtemp(join(tmpdir(), "calos-e2e-"));
    const webApp = new WebApp(
      directory,
      (name) => testInfo.outputPath(name),
      autoOnboard,
    );

    try {
      await webApp.launch();
      await use(webApp);
    } finally {
      try {
        try {
          if (
            testInfo.status !== testInfo.expectedStatus &&
            webApp.page &&
            !webApp.page.isClosed()
          ) {
            await testInfo.attach("failure", {
              body: await webApp.page.screenshot(),
              contentType: "image/png",
            });
          }
        } finally {
          await webApp.close();
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
});
export { expect };
