import { test, expect } from "./fixtures.js";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";
import { send } from "./chat.js";

test.use({ autoOnboard: false });

async function createManualProfile(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Crear perfil manualmente" }).click();
  const form = page.locator(".manual-profile-form");
  await form.getByLabel("Nombre", { exact: true }).fill("Eva E2E");
  await form.getByLabel("Edad", { exact: true }).fill("34");
  await form.getByLabel("Altura (cm)", { exact: true }).fill("168");
  await form.getByLabel("Peso (kg)", { exact: true }).fill("71");
  await form
    .getByLabel("Objetivo que quieres anotar", { exact: true })
    .fill("Mantener mis registros personales");
  await form.getByLabel("Calorías (kcal)", { exact: true }).fill("2000");
  await form.getByLabel("Proteína (g)", { exact: true }).fill("100");
  await form.getByLabel("Carbohidratos (g)", { exact: true }).fill("200");
  await form.getByLabel("Grasas (g)", { exact: true }).fill("70");
  await form
    .getByRole("button", { name: "Crear perfil manualmente", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
}

async function addManualFood(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Registrar comida" }).click();
  const form = page.locator(".manual-food-form");
  await form.getByLabel("Alimento o plato", { exact: true }).fill("Pan de avena");
  await form.getByLabel("Cantidad consumida", { exact: true }).fill("200 g");
  await form.getByLabel("Fecha", { exact: true }).fill("2026-01-01");
  await form.locator('select[name="meal"]').selectOption("Desayuno");
  await form.getByLabel("Energía (kcal)", { exact: true }).fill("2300");
  await form.getByLabel("Proteína (g)", { exact: true }).fill("110");
  await form.getByLabel("Carbohidratos (g)", { exact: true }).fill("230");
  await form.getByLabel("Grasas (g)", { exact: true }).fill("80");
  await form.locator('select[name="provider"]').selectOption("Datos del usuario");
  await form
    .locator('input[name="evidence"]')
    .fill("Valores escritos desde mi etiqueta, ración de 200 g");
  await form.getByRole("button", { name: "Añadir registro", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Pan de avena");
}

test("crear perfil sin OpenRouter, editar y guardar nutrientes y procedencia manuales", async ({
  webApp,
}, testInfo) => {
  const page = webApp.page;
  await expect(
    page.getByText(/tu mensaje y hasta 40 mensajes anteriores/, { exact: false }),
  ).toBeVisible();
  await createManualProfile(page);
  expect(await webApp.requests(true)).toEqual([]);
  await addManualFood(page);
  const entry = (await webApp.snapshot()).entries[0];
  expect(entry).toMatchObject({
    name: "Pan de avena",
    quantity: "200 g",
    meal: "Desayuno",
    eatenAt: expect.stringMatching(/^2026-01-01/),
    calories: 2300,
    protein: 110,
    carbs: 230,
    fat: 80,
    source: {
      provider: "Datos del usuario",
      basis: "serving",
      evidence: "Valores escritos desde mi etiqueta, ración de 200 g",
    },
  });
  await page.getByRole("button", { name: "Editar Pan de avena" }).click();
  const editor = page.locator(".manual-food-form");
  await editor
    .getByLabel("Alimento o plato", { exact: true })
    .fill("Pan de avena casero");
  await editor.getByLabel("Cantidad consumida", { exact: true }).fill("220 g");
  await editor.getByLabel("Fecha", { exact: true }).fill("2026-01-03");
  await editor.locator('select[name="meal"]').selectOption("Comida");
  await editor.getByLabel("Energía (kcal)", { exact: true }).fill("2500");
  await editor.getByLabel("Proteína (g)", { exact: true }).fill("120");
  await editor.getByLabel("Carbohidratos (g)", { exact: true }).fill("250");
  await editor.getByLabel("Grasas (g)", { exact: true }).fill("90");
  await editor.locator('select[name="provider"]').selectOption("Etiqueta nutricional");
  await editor
    .locator('input[name="evidence"]')
    .fill("Etiqueta nutricional para la cantidad registrada de 220 g");
  await editor.getByRole("button", { name: "Añadir registro", exact: true }).click();
  await page.getByLabel("Consultar fecha").fill("2026-01-03");
  await expect(page.getByRole("article")).toContainText("Pan de avena casero");
  await expect(page.locator(".remaining-over")).toContainText(
    "500 kcal por encima de la referencia",
  );
  await expect(page.locator(".macro-excess").first()).toContainText(
    "20 g por encima de la referencia",
  );
  expect((await webApp.snapshot()).entries[0]).toMatchObject({
    id: entry.id,
    name: "Pan de avena casero",
    quantity: "220 g",
    meal: "Comida",
    eatenAt: expect.stringMatching(/^2026-01-03/),
    calories: 2500,
    protein: 120,
    carbs: 250,
    fat: 90,
    source: {
      provider: "Etiqueta nutricional",
      evidence: "Etiqueta nutricional para la cantidad registrada de 220 g",
    },
  });

  await page.locator(".favorite-save summary").click();
  await page
    .locator('.favorite-save input[name="favoriteName"]')
    .fill("Comida habitual");
  await page
    .locator(".favorite-save")
    .getByRole("button", { name: "Guardar comida" })
    .click();
  await expect(page.getByText("Comida guardada para repetir.")).toBeVisible();
  await page.getByLabel("Consultar fecha").fill("2026-01-02");
  await page.getByRole("button", { name: "Repetir Comida habitual" }).click();
  await expect(page.getByRole("article")).toContainText("Pan de avena casero");
  expect((await webApp.snapshot()).entries).toHaveLength(2);
  expect(
    (await webApp.snapshot()).entries.find((item) =>
      item.eatenAt.startsWith("2026-01-02"),
    ),
  ).toMatchObject({
    quantity: "220 g",
    meal: "Comida",
    calories: 2500,
    source: { provider: "Etiqueta nutricional" },
  });
  await page.getByLabel("Consultar fecha").fill("2026-01-03");
  await page.getByRole("button", { name: "Repetir Pan de avena casero" }).click();
  const repeatForm = page.locator(".repeat-entry-form");
  await repeatForm
    .getByLabel("Fecha en la que repetir", { exact: true })
    .fill("2026-01-04");
  await repeatForm.getByRole("button", { name: "Repetir en esta fecha" }).click();
  await expect(page.getByRole("article")).toContainText("Pan de avena casero");
  expect((await webApp.snapshot()).entries).toHaveLength(3);
  expect(
    (await webApp.snapshot()).entries.find((item) =>
      item.eatenAt.startsWith("2026-01-04"),
    ),
  ).toMatchObject({
    calories: 2500,
    source: { provider: "Etiqueta nutricional" },
  });

  await page.locator(".data-portability summary").click();
  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  const backup = JSON.parse(await readFile((await jsonDownload.path())!, "utf8"));
  expect(backup.entries).toHaveLength(3);
  expect(backup.templates).toHaveLength(1);
  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV de comidas" }).click();
  const csvDownload = await csvDownloadPromise;
  const csv = await readFile((await csvDownload.path())!, "utf8");
  expect(csv).toContain("nombre");
  expect(csv).toContain("Pan de avena casero");

  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  const profileStorage = join(webApp.directory, "profiles", registry.activeId);
  const backupDirectory = join(profileStorage, "backups");
  await expect(access(backupDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  const beforeInvalidImport = await webApp.snapshot();
  const invalidResponse = await page.evaluate(
    async ({ profileId }) =>
      fetch("/api/rpc/nutrition:import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([profileId, { version: 1, entries: [] }]),
      }).then((response) => response.status),
    { profileId: registry.activeId },
  );
  expect(invalidResponse).toBe(400);
  expect(await webApp.snapshot()).toEqual(beforeInvalidImport);
  await expect(access(backupDirectory)).rejects.toMatchObject({ code: "ENOENT" });

  await page.getByLabel("Consultar fecha").fill("2026-01-02");
  await page.getByRole("button", { name: "Eliminar Pan de avena casero" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect((await webApp.snapshot()).deletedEntries).toHaveLength(1);
  const beforeImport = await webApp.snapshot();
  const backupPath = join(webApp.directory, "isolated-backup.json");
  await writeFile(backupPath, JSON.stringify(backup));
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator(".portability-upload input").setInputFiles(backupPath);
  const importStatus = page.getByRole("status").filter({
    hasText: "Datos importados. Se creó el respaldo previo",
  });
  await expect(importStatus).toBeVisible();
  const backupNames = await readdir(backupDirectory);
  expect(backupNames).toHaveLength(1);
  const backupId = backupNames[0]!.replace(/^nutrition-/, "").replace(/\.json$/, "");
  expect(await importStatus.innerText()).toContain(backupId);
  expect(await importStatus.innerText()).toContain(
    "puedes descargarlo o restaurarlo en la gestión de respaldos.",
  );
  expect(
    JSON.parse(await readFile(join(backupDirectory, backupNames[0]!), "utf8")),
  ).toEqual(beforeImport);
  await expect(page.getByRole("article")).toHaveCount(1);
  expect((await webApp.snapshot()).entries).toHaveLength(3);

  await page.getByRole("button", { name: "Eliminar Pan de avena casero" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect((await webApp.snapshot()).deletedEntries).toHaveLength(1);
  await webApp.restart();
  await webApp.page.getByText("Registros eliminados · 1", { exact: true }).click();
  await webApp.page
    .getByRole("button", { name: "Restaurar Pan de avena casero" })
    .click();
  await expect(
    webApp.page.getByText("Registro restaurado.", { exact: true }),
  ).toBeVisible();
  expect((await webApp.snapshot()).entries).toHaveLength(3);
  expect((await webApp.snapshot()).deletedEntries).toHaveLength(0);
  expect(await webApp.requests(true)).toEqual([]);
  await webApp.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await webApp.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await webApp.page.screenshot({
    path: testInfo.outputPath("manual-tools-mobile.png"),
    fullPage: true,
  });
});

test("la importación HTTP rechaza campos desconocidos y datos fuera de límites", async ({
  webApp,
}) => {
  await createManualProfile(webApp.page);
  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  const beforeMalformedImport = await webApp.snapshot();
  const malformed = await webApp.page.evaluate(
    async ({ profileId }) =>
      fetch("/api/rpc/nutrition:import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          profileId,
          {
            version: 1,
            entries: [],
            customFoods: [],
            dailyGoal: { calories: 2000, protein: 100, carbs: 200, fat: 70 },
            waistMeasurements: [],
            weightMeasurements: [],
            profile: null,
            extra: "no permitido",
          },
        ]),
      }).then((response) => response.status),
    { profileId: registry.activeId },
  );
  expect(malformed).toBe(400);
  expect(await webApp.snapshot()).toEqual(beforeMalformedImport);
  await expect(
    access(join(webApp.directory, "profiles", registry.activeId, "backups")),
  ).rejects.toMatchObject({ code: "ENOENT" });

  const exported = await webApp.page.evaluate(
    async ({ profileId }) => {
      const response = await fetch("/api/rpc/nutrition:export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([profileId]),
      });
      return { status: response.status, body: await response.json() };
    },
    { profileId: registry.activeId },
  );
  expect(exported.status).toBe(200);
  const beforeBackupFailure = await webApp.snapshot();
  const profileStorage = join(webApp.directory, "profiles", registry.activeId);
  const backupBlocker = join(profileStorage, "backups");
  await writeFile(backupBlocker, "not a directory");
  const failedImport = await webApp.page.evaluate(
    async ({ profileId, snapshot }) => {
      const response = await fetch("/api/rpc/nutrition:import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([profileId, snapshot]),
      });
      return { status: response.status, body: await response.json() };
    },
    { profileId: registry.activeId, snapshot: exported.body.data },
  );
  expect(failedImport.status).toBe(400);
  expect(failedImport.body.error).toBe(
    "No se ha podido crear el respaldo previo; no se ha modificado el perfil.",
  );
  expect(failedImport.body.error).not.toContain(webApp.directory);
  expect(await webApp.snapshot()).toEqual(beforeBackupFailure);
  expect(await readFile(backupBlocker, "utf8")).toBe("not a directory");
  expect(await webApp.requests(true)).toEqual([]);
});

test("el chat muestra y utiliza la fecha de destino seleccionada y devuelve un recibo editable", async ({
  webApp,
}) => {
  const page = webApp.page;
  await createManualProfile(page);
  const targetDate = "2026-02-10";
  await page.getByLabel("Consultar fecha").fill(targetDate);
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(page.locator(".chat-destination")).toContainText(
    "10 de febrero de 2026",
  );
  const chicken = catalogue.find(
    (food) =>
      food.description ===
      "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
  )!;
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          {
            name: "Pollo asado",
            queries: ["chicken breast meat cooked roasted"],
            grams: 100,
            milliliters: null,
            label: null,
            portionCount: null,
            portionDescription: null,
            meal: "Comida",
          },
        ],
        clarification: null,
      },
    },
    {
      name: "meal_matches",
      content: {
        matches: [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
        clarification: null,
      },
    },
  ]);
  await send(page, "He comido 100 g de pechuga de pollo asada");
  const saved = (await webApp.snapshot()).entries[0];
  expect(saved.eatenAt.slice(0, 10)).toBe(targetDate);
  expect(saved.calories).toBe(chicken.per100g.calories);
  expect((await webApp.requests())[0]!.messages[1]!.content).toContain(
    `"registrationDate":"${targetDate}"`,
  );
  await expect(page.getByRole("region", { name: "Registro guardado" })).toContainText(
    "Pollo asado",
  );
  await page.getByRole("button", { name: "Editar este registro" }).click();
  await expect(page.locator(".manual-food-form")).toBeVisible();
  await expect(
    page.locator(".manual-food-form").getByLabel("Alimento o plato", { exact: true }),
  ).toHaveValue("Pollo asado");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("#chat")).toBeVisible();

  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  const profileId = registry.activeId as string;
  const exported = await page.evaluate(
    async ({ id }) => {
      const response = await fetch("/api/rpc/nutrition:export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([id]),
      });
      return { status: response.status, body: await response.json() };
    },
    { id: profileId },
  );
  expect(exported.status).toBe(200);
  const assistantSnapshot = exported.body.data;
  expect(assistantSnapshot.entries).toHaveLength(1);
  expect(assistantSnapshot.entries[0].source.provider).toBe("USDA FoodData Central");
  expect(assistantSnapshot.profile).toMatchObject({
    name: "Eva E2E",
    goal: "Mantener mis registros personales",
  });
  const exportedBytes = Buffer.byteLength(JSON.stringify(assistantSnapshot));
  expect(exportedBytes).toBeLessThan(9 * 1024 * 1024);
  expect(
    Buffer.byteLength(JSON.stringify([profileId, assistantSnapshot])),
  ).toBeLessThan(10 * 1024 * 1024);

  const deleted = await page.evaluate(
    async ({ id, entryId }) => {
      const response = await fetch("/api/rpc/nutrition:delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([id, entryId]),
      });
      return response.status;
    },
    { id: profileId, entryId: saved.id },
  );
  expect(deleted).toBe(200);
  const stateBeforeImport = await webApp.snapshot();
  expect(stateBeforeImport.entries).toHaveLength(0);
  expect(stateBeforeImport.deletedEntries).toHaveLength(1);

  const imported = await page.evaluate(
    async ({ id, snapshot }) => {
      const response = await fetch("/api/rpc/nutrition:import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([id, snapshot]),
      });
      return { status: response.status, body: await response.json() };
    },
    { id: profileId, snapshot: assistantSnapshot },
  );
  expect(imported.status).toBe(200);
  expect(imported.body.data.recoveryInstructions).toContain(
    "gestión de respaldos de este perfil",
  );
  expect(await webApp.snapshot()).toMatchObject(assistantSnapshot);
  expect((await webApp.snapshot()).undoOperations).toEqual([]);
  expect(
    JSON.parse(
      await readFile(
        join(webApp.directory, "profiles", profileId, imported.body.data.backupPath),
        "utf8",
      ),
    ),
  ).toEqual(stateBeforeImport);
});

test("fecha local válida se guarda y repite por HTTP en Pacific/Kiritimati", async ({
  webApp,
}) => {
  await createManualProfile(webApp.page);
  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  const profileId = registry.activeId as string;
  const previousTimezone = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati";

  try {
    const saved = await webApp.page.evaluate(
      async ({ id }) => {
        const response = await fetch("/api/rpc/nutrition:food-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            id,
            {
              name: "Tostada de prueba TZ",
              quantity: "1 unidad",
              meal: "Desayuno",
              date: "2026-01-01",
              calories: 120,
              protein: 4,
              carbs: 22,
              fat: 2,
              provider: "Datos del usuario",
              evidence: "Dato temporal E2E",
            },
          ]),
        });
        return { status: response.status, body: await response.json() };
      },
      { id: profileId },
    );
    expect(saved.status).toBe(200);
    expect(saved.body.data.eatenAt).toBe("2026-01-01T12:00:00.000+14:00");

    const repeated = await webApp.page.evaluate(
      async ({ id, entryId }) => {
        const response = await fetch("/api/rpc/nutrition:repeat-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([id, entryId, "2026-02-02"]),
        });
        return { status: response.status, body: await response.json() };
      },
      { id: profileId, entryId: saved.body.data.id },
    );
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.eatenAt).toBe("2026-02-02T12:00:00.000+14:00");

    const template = await webApp.page.evaluate(
      async ({ id, entryId }) => {
        const response = await fetch("/api/rpc/nutrition:template-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            id,
            { name: "Plantilla temporal", entryIds: [entryId] },
          ]),
        });
        return { status: response.status, body: await response.json() };
      },
      { id: profileId, entryId: saved.body.data.id },
    );
    expect(template.status).toBe(200);

    const repeatedTemplate = await webApp.page.evaluate(
      async ({ id, templateId }) => {
        const response = await fetch("/api/rpc/nutrition:template-repeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([id, templateId, "2026-03-03", 1]),
        });
        return { status: response.status, body: await response.json() };
      },
      { id: profileId, templateId: template.body.data.id },
    );
    expect(repeatedTemplate.status).toBe(200);
    expect(repeatedTemplate.body.data.entries[0].eatenAt).toBe(
      "2026-03-03T12:00:00.000+14:00",
    );

    expect((await webApp.snapshot()).entries.map((entry) => entry.eatenAt)).toEqual([
      "2026-01-01T12:00:00.000+14:00",
      "2026-02-02T12:00:00.000+14:00",
      "2026-03-03T12:00:00.000+14:00",
    ]);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});
