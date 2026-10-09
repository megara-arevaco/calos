import { test, expect } from "./fixtures.js";
import { profileProposal } from "./onboarding.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test.use({ autoOnboard: false });
async function say(page: import("@playwright/test").Page, text: string) {
  await page.locator("#onboarding-message").fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
}

test("conversación: repreguntar, recomendar, ajustar y persistir los objetivos", async ({
  webApp,
}, testInfo) => {
  const page = webApp.page;
  const initial = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  expect(initial.profiles).toEqual([]);
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: {
        message: "Encantada, Ana. ¿Cuánto mides y cuánto pesas?",
        profile: null,
      },
    },
  ]);
  await say(page, "Soy Ana, tengo 35 años y quiero mantener mi peso.");
  await expect(
    page.getByText("Encantada, Ana. ¿Cuánto mides y cuánto pesas?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aplicar objetivos y empezar" }),
  ).toHaveCount(0);
  const proposal = profileProposal("Ana");
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: {
        message:
          "Te propongo 2200 kcal como estimación inicial según tu actividad. Podemos ajustarlo según tu evolución.",
        profile: proposal,
      },
    },
  ]);
  await say(
    page,
    "Mido 175 cm, peso 80 kg, soy mujer y entreno tres veces por semana.",
  );
  const preview = page.getByRole("region", { name: "Tu punto de partida" });
  await expect(preview).toContainText("2200 kcal");
  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  expect(registry.profiles).toEqual([]);
  const requests = await webApp.requests(true);
  expect(JSON.parse(requests[1].messages[1].content).history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        text: "Soy Ana, tengo 35 años y quiero mantener mi peso.",
      }),
      expect.objectContaining({
        role: "assistant",
        text: "Encantada, Ana. ¿Cuánto mides y cuánto pesas?",
      }),
    ]),
  );
  expect(await page.evaluate(() => JSON.stringify(window.calos))).not.toContain(
    "e2e-fake-key",
  );
  await page.screenshot({
    path: testInfo.outputPath("onboarding-wide.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  await expect(
    page.getByText(
      "Te propongo 2200 kcal como estimación inicial según tu actividad. Podemos ajustarlo según tu evolución.",
      { exact: true },
    ),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("onboarding-mobile.png"),
    fullPage: true,
  });
  const updated = profileProposal("Ana", "Respuestas breves", "2000");
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: {
        message: "Usaremos los objetivos de 2000 kcal que ya tienes pautados.",
        profile: updated,
      },
    },
  ]);
  await say(page, "Tengo pautadas 2000 kcal; usa ese objetivo y responde brevemente.");
  await expect(preview).toContainText("2000 kcal");
  expect(
    JSON.parse((await webApp.requests(true))[2].messages[1].content).history.at(-1)
      .text,
  ).toContain('"dailyCalories":2200');
  await page.getByRole("button", { name: "Aplicar objetivos y empezar" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
  expect((await webApp.snapshot()).dailyGoal).toEqual({
    calories: 2000,
    protein: 140,
    carbs: 202.5,
    fat: 70,
  });
  expect((await webApp.snapshot()).profile).toMatchObject({
    name: "Ana",
    assistantInstructions: "Respuestas breves",
  });
  await webApp.restart();
  await expect(
    webApp.page.getByLabel("Perfil activo").locator("option:checked"),
  ).toHaveText("Ana");
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(2000);
});

test("errores del proveedor y macros incoherentes: conservar mensaje y no crear perfil", async ({
  webApp,
}) => {
  const page = webApp.page;
  await webApp.mock([{ name: "profile_onboarding", status: 429 }]);
  await say(page, "Soy Luis y quiero ganar músculo.");
  await expect(page.getByRole("alert")).toContainText("límite de peticiones");
  await expect(page.locator("#onboarding-message")).toHaveValue(
    "Soy Luis y quiero ganar músculo.",
  );
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: {
        message: "Una propuesta",
        profile: { ...profileProposal("Luis"), dailyCalories: 9000 },
      },
    },
  ]);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("no cuadran");
  await expect(
    page.getByRole("button", { name: "Aplicar objetivos y empezar" }),
  ).toHaveCount(0);
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: { message: "¿Cuál es tu edad y altura?", profile: null },
    },
  ]);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(
    page.getByText("¿Cuál es tu edad y altura?", { exact: true }),
  ).toBeVisible();
  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  expect(registry.profiles).toEqual([]);
});

test("onboarding sin clave: explicar cómo activar el asistente", async ({ webApp }) => {
  await webApp.close();
  await webApp.launch("");
  await say(webApp.page, "Soy Ana y quiero mantener mi peso.");
  await expect(webApp.page.getByRole("alert")).toContainText(
    "Configura OPENROUTER_API_KEY",
  );
  await expect(webApp.page.locator("#onboarding-message")).toHaveValue(
    "Soy Ana y quiero mantener mi peso.",
  );
  expect(await webApp.requests(true)).toEqual([]);
});
