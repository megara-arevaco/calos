import { test, expect } from "./fixtures.js";
import { createProfile } from "./onboarding.js";
import { send } from "./chat.js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

test.use({ autoOnboard: false });

test("perfiles: onboarding, datos y prompt separados, selección persistente", async ({
  webApp,
}) => {
  const page = webApp.page;
  await createProfile(page, "Ana", "Responde brevemente y sin lácteos.", "1800");
  await page.getByRole("button", { name: "Peso", exact: true }).click();
  const panel = page.getByRole("region", { name: "Medidas de peso" });
  await panel.getByLabel("Peso (kg)", { exact: true }).fill("75");
  await panel.getByRole("button", { name: "Guardar medida", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Medida guardada.");
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "answer",
        foods: [],
        clarification: "Tu objetivo es 1800 kcal.",
      },
    },
  ]);
  await send(page, "¿Cuál es mi objetivo?");
  expect((await webApp.requests())[0].messages[0].content).toContain(
    "Responde brevemente y sin lácteos.",
  );
  expect((await webApp.requests())[0].messages[0].content).toContain("75");
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          {
            name: "Yogur",
            queries: ["yogurt"],
            grams: 100,
            milliliters: null,
            portionCount: null,
            portionDescription: null,
            meal: "Cena",
            label: {
              basis: "100g",
              servingGrams: null,
              kilojoules: null,
              evidence: "Valores por 100 g de yogur",
              calories: 70,
              protein: 5,
              carbs: 8,
              fat: 2,
            },
          },
        ],
        clarification: null,
      },
    },
  ]);
  await page.getByLabel("Foto de etiqueta nutricional").setInputFiles({
    name: "etiqueta.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Comida", exact: true }).click();
  await send(page, "100 g de este yogur");
  await expect(page.getByRole("article")).toContainText("Yogur");
  await page.getByLabel("Foto de plato", { exact: true }).setInputFiles({
    name: "plato.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("Plato adjunto")).toBeVisible();
  await page.locator("#chat-input").fill("borrador de Ana");
  await page.getByRole("button", { name: "Nuevo perfil" }).click();
  await createProfile(page, "Luis", "Háblame en detalle.", "2500");
  await expect(page.locator("#chat-input")).toHaveValue("");
  await expect(page.locator(".message.assistant")).toHaveCount(1);
  expect((await webApp.snapshot()).weightMeasurements).toEqual([]);
  expect((await webApp.snapshot()).entries).toEqual([]);
  await expect(page.getByAltText("Plato adjunto")).toHaveCount(0);
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "answer",
        foods: [],
        clarification: "Tu objetivo es 2500 kcal.",
      },
    },
  ]);
  await send(page, "¿Cuál es mi objetivo?");
  const request = (await webApp.requests())[2];
  expect(request.messages[0].content).toContain("Háblame en detalle.");
  expect(request.messages[0].content).not.toContain("sin lácteos");
  expect(JSON.parse(request.messages[1].content).history).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: "Tu objetivo es 1800 kcal." }),
    ]),
  );
  await page.getByLabel("Perfil activo").selectOption({ label: "Ana" });
  await expect(page.getByLabel("Perfil activo").locator("option:checked")).toHaveText(
    "Ana",
  );
  await page.getByRole("button", { name: "Peso", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Medidas de peso" }).getByRole("listitem"),
  ).toContainText("75 kg");
  expect((await webApp.snapshot("Luis")).dailyGoal.calories).toBe(2500);
  expect((await webApp.snapshot("Ana")).entries).toHaveLength(1);
  await webApp.restart();
  await expect(
    webApp.page.getByLabel("Perfil activo").locator("option:checked"),
  ).toHaveText("Ana");
  expect((await webApp.snapshot()).profile?.name).toBe("Ana");
});

test("perfiles: migrar datos anteriores sin modificar el original", async ({
  webApp,
}) => {
  await createProfile(webApp.page);
  const original = await webApp.snapshot();
  original.profile = { goal: "Objetivo anterior", weightKg: 77, heightCm: 175 };
  original.dailyGoal.calories = 1900;
  await webApp.close();
  const legacy = join(webApp.directory, "nutrition.json");
  const text = JSON.stringify(original);
  await writeFile(legacy, text);
  await rm(join(webApp.directory, "profiles.json"));
  await webApp.launch();
  await expect(
    webApp.page.getByLabel("Perfil activo").locator("option:checked"),
  ).toHaveText("Mi perfil");
  expect(await webApp.snapshot()).toEqual(original);
  expect(await readFile(legacy, "utf8")).toBe(text);
});
