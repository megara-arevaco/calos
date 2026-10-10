import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";

import { readFile, readdir, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";

const chicken = catalogue.find(
  (food) =>
    food.description ===
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
)!;

const rice = catalogue.find(
  (food) => food.description === "Rice, white, long-grain, regular, enriched, cooked",
)!;

const risotto = {
  name: "Risotto de setas",
  queries: ["an unfindable mushroom risotto"],
  grams: 300,
  milliliters: null,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: "Cena",
};

const risottoEstimate = {
  calories: 160,
  protein: 4,
  carbs: 22,
  fat: 6,
  reason: "No hay una receta exacta del risotto.",
  assumptions: ["Arroz cocido con setas, queso y grasa; proporciones desconocidas."],
};

const photo = {
  name: "plato.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function profileId(webApp: { directory: string }) {
  const registry = JSON.parse(
    await readFile(join(webApp.directory, "profiles.json"), "utf8"),
  );
  return registry.activeId as string;
}

async function rpc(
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

async function createManualProfile(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Crear perfil manualmente" }).click();
  const form = page.locator(".manual-profile-form");
  await form.getByLabel("Nombre", { exact: true }).fill("Perfil revisión");
  await form.getByLabel("Edad", { exact: true }).fill("35");
  await form.getByLabel("Altura (cm)", { exact: true }).fill("170");
  await form.getByLabel("Peso (kg)", { exact: true }).fill("70");
  await form
    .getByLabel("Objetivo que quieres anotar", { exact: true })
    .fill("Registro temporal E2E");
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

test("la receta independiente escala porciones, referencias, rangos y mantiene la etiqueta de estimación", async ({
  webApp,
}, testInfo) => {
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [{ ...risotto, estimate: risottoEstimate }],
        clarification: null,
      },
    },
  ]);
  await send(webApp.page, "Añade de cena 300 g de risotto de setas");
  await webApp.page.locator(".favorite-save summary").click();
  const saveForm = webApp.page.locator(".favorite-save form");
  await saveForm.locator('input[name="favoriteName"]').fill("Receta base de setas");
  await saveForm.locator('input[name="baseServings"]').fill("2");
  await saveForm.getByRole("button", { name: "Guardar comida" }).click();
  await expect(webApp.page.getByText("Comida guardada para repetir.")).toBeVisible();

  await webApp.page.getByRole("button", { name: "Editar receta", exact: true }).click();
  const editor = webApp.page.locator(".recipe-editor-form");
  await editor
    .getByLabel("Nombre de la receta", { exact: true })
    .fill("Risotto revisado");
  await editor
    .getByLabel("Porciones que representa esta receta base", { exact: true })
    .fill("3");
  await editor
    .getByLabel("Factor de cantidad de Risotto de setas", { exact: true })
    .fill("1.2");
  await expect(webApp.page.locator(".recipe-editor")).toContainText(
    "Valores aproximados",
  );
  await webApp.page.screenshot({
    path: testInfo.outputPath("recipe-editor-desktop.png"),
    fullPage: true,
  });
  await editor.getByRole("button", { name: "Guardar receta" }).click();
  await expect(webApp.page.getByText("Receta actualizada.")).toBeVisible();

  const savedRecipe = (await webApp.snapshot()).templates?.[0]!;
  expect(savedRecipe).toMatchObject({ name: "Risotto revisado", baseServings: 3 });
  expect(savedRecipe.entries[0]).toMatchObject({
    calories: 576,
    quantity: "300 g · ×1.2 receta",
    source: {
      provider: "Estimación",
      basis: "100g",
      amount: 360,
      perBasis: { calories: 160 },
      assumptions: risottoEstimate.assumptions,
    },
  });

  const repeat = webApp.page.locator(".recipe-repeat-form");
  await repeat
    .getByLabel("Porciones de Risotto revisado que vas a registrar", { exact: true })
    .fill("6");
  await repeat.getByRole("button", { name: "Repetir Risotto revisado" }).click();
  await expect(
    webApp.page.getByText("Registro repetido en", { exact: false }),
  ).toBeVisible();
  const logged = (await webApp.snapshot()).entries.at(-1)!;
  expect(logged).toMatchObject({
    calories: 1152,
    protein: 28.8,
    carbs: 158.4,
    fat: 43.2,
    quantity: "300 g · ×1.2 receta · ×2 receta",
    source: {
      provider: "Estimación",
      amount: 720,
      perBasis: { calories: 160, protein: 4, carbs: 22, fat: 6 },
      assumptions: risottoEstimate.assumptions,
    },
  });
  expect((await webApp.snapshot()).entries).toHaveLength(2);
  await webApp.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await webApp.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await webApp.page.screenshot({
    path: testInfo.outputPath("recipe-repeat-mobile.png"),
    fullPage: true,
  });
  expect(await webApp.requests()).toHaveLength(1);
});

test("las porciones conservan los rangos de referencia y escalan rangos de cantidad", async ({
  webApp,
}) => {
  const evidence =
    "Por 100 g: calorías 100-120 kcal, proteínas 2-4 g, carbohidratos 10-14 g, grasas 3-5 g";
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          {
            ...risotto,
            grams: 200,
            customNutrition: {
              basisGrams: 100,
              calories: { min: 100, max: 120 },
              protein: { min: 2, max: 4 },
              carbs: { min: 10, max: 14 },
              fat: { min: 3, max: 5 },
              evidence,
            },
          },
        ],
        clarification: null,
      },
    },
  ]);
  await send(webApp.page, `Registra 200 g de risotto; ${evidence}`);
  await webApp.page.locator(".favorite-save summary").click();
  const form = webApp.page.locator(".favorite-save form");
  await form.locator('input[name="favoriteName"]').fill("Risotto con rangos");
  await form.locator('input[name="baseServings"]').fill("2");
  await form.getByRole("button", { name: "Guardar comida" }).click();
  const repeat = webApp.page.locator(".recipe-repeat-form");
  await repeat
    .getByLabel("Porciones de Risotto con rangos que vas a registrar", { exact: true })
    .fill("3");
  await repeat.getByRole("button", { name: "Repetir Risotto con rangos" }).click();
  await expect(
    webApp.page.getByText("Registro repetido en", { exact: false }),
  ).toBeVisible();
  const entry = (await webApp.snapshot()).entries.at(-1)!;
  expect(entry).toMatchObject({
    calories: 330,
    protein: 9,
    carbs: 36,
    fat: 12,
    source: {
      provider: "Datos del usuario",
      basis: "100g",
      amount: 300,
      ranges: {
        calories: { min: 100, max: 120 },
        protein: { min: 2, max: 4 },
        carbs: { min: 10, max: 14 },
        fat: { min: 3, max: 5 },
      },
      amountRanges: {
        calories: { min: 300, max: 360 },
        protein: { min: 6, max: 12 },
        carbs: { min: 30, max: 42 },
        fat: { min: 9, max: 15 },
      },
      evidence,
    },
  });
  expect(entry.source?.provider).not.toBe("Estimación");
  const loggedRow = webApp.page.getByRole("article").filter({ hasText: "×1.5 receta" });
  await loggedRow.getByText("Datos del usuario", { exact: true }).click();
  await expect(loggedRow).toContainText("Rangos para esta cantidad");
  expect(await webApp.requests()).toHaveLength(1);
});

test("el recibo deshace altas tras reiniciar y una corrección múltiple se revierte atómicamente solo si sigue intacta", async ({
  webApp,
}) => {
  const food = (name: string, query: string) => ({
    name,
    queries: [query],
    grams: 100,
    milliliters: null,
    label: null,
    portionCount: null,
    portionDescription: null,
    meal: "Comida",
  });
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [food("Pechuga", "chicken breast cooked roasted")],
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
  await send(webApp.page, "Registra 100 g de pechuga asada");
  await expect(
    webApp.page.getByRole("region", { name: "Registro guardado" }),
  ).toContainText("Pechuga");
  expect((await webApp.snapshot()).entries).toHaveLength(1);

  await webApp.restart();
  await expect(
    webApp.page.getByRole("region", { name: "Registro guardado" }),
  ).toContainText("Pechuga");
  await webApp.page.getByRole("button", { name: "Deshacer esta operación" }).click();
  await expect(webApp.page.locator(".chat-undo-feedback")).toContainText(
    "Operación deshecha. Los datos anteriores se han restaurado.",
  );
  expect((await webApp.snapshot()).entries).toEqual([]);
  await webApp.restart();
  expect((await webApp.snapshot()).entries).toEqual([]);

  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          food("Pechuga", "chicken breast cooked roasted"),
          food("Arroz blanco", "white rice cooked"),
        ],
        clarification: null,
      },
    },
    {
      name: "meal_matches",
      content: {
        matches: [
          { index: 0, fdcId: chicken.fdcId, portionIndex: null },
          { index: 1, fdcId: rice.fdcId, portionIndex: null },
        ],
        clarification: null,
      },
    },
  ]);
  await send(
    webApp.page,
    "Registra 100 g de pechuga asada y 100 g de arroz blanco cocido",
  );
  const originals = (await webApp.snapshot()).entries;
  expect(originals).toHaveLength(2);
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        clarification: null,
        foods: originals.map((entry) => ({
          ...food(
            entry.name,
            entry.name === "Pechuga"
              ? "chicken breast cooked roasted"
              : "white rice cooked",
          ),
          grams: 200,
          entryId: entry.id,
          keepSource: true,
        })),
      },
    },
  ]);
  await send(webApp.page, "Corrige ambos registros: fueron 200 g cada uno");
  const corrected = await webApp.snapshot();
  expect(corrected.entries.map((entry) => entry.calories)).toEqual([
    chicken.per100g.calories * 2,
    rice.per100g.calories * 2,
  ]);
  const first = corrected.entries.find((entry) => entry.id === originals[0]!.id)!;
  const second = corrected.entries.find((entry) => entry.id === originals[1]!.id)!;
  const correctionUndoId = corrected.undoOperations!.at(-1)!.id;

  await webApp.page.getByRole("button", { name: `Editar ${first.name}` }).click();
  const editor = webApp.page.locator(".manual-food-form");
  await editor.getByLabel("Energía (kcal)", { exact: true }).fill("5000");
  await editor
    .locator('input[name="evidence"]')
    .fill("Corrección manual temporal de prueba");
  await editor.getByRole("button", { name: "Añadir registro", exact: true }).click();
  const manualUndoId = (await webApp.snapshot()).undoOperations!.at(-1)!.id;
  expect(manualUndoId).not.toBe(correctionUndoId);
  await webApp.restart();

  const staleUndo = await rpc(webApp.page, "nutrition:undo", [
    await profileId(webApp),
    correctionUndoId,
  ]);
  expect(staleUndo.status).toBe(400);
  expect(staleUndo.body.error).toContain("No se ha deshecho nada");
  const afterStaleUndo = await webApp.snapshot();
  expect(afterStaleUndo.entries.find((entry) => entry.id === first.id)?.calories).toBe(
    5000,
  );
  expect(afterStaleUndo.entries.find((entry) => entry.id === second.id)).toEqual(
    second,
  );

  await webApp.page.getByRole("button", { name: "Asistente", exact: true }).click();
  await webApp.page.getByRole("button", { name: "Deshacer esta operación" }).click();
  await expect(webApp.page.locator(".chat-undo-feedback")).toContainText(
    "Operación deshecha. Los datos anteriores se han restaurado.",
  );
  const afterManualUndo = await webApp.snapshot();
  expect(afterManualUndo.entries.find((entry) => entry.id === first.id)).toEqual(first);
  expect(afterManualUndo.entries.find((entry) => entry.id === second.id)).toEqual(
    second,
  );
});

test("respaldos descargables/restaurables solo por ID, validación de traversal y retención opt-in de papelera y respaldos", async ({
  webApp,
}) => {
  const id = await profileId(webApp);
  const input = (name: string) => ({
    name,
    quantity: "1 ración",
    meal: "Comida",
    date: localDate(),
    calories: 200,
    protein: 10,
    carbs: 20,
    fat: 5,
    provider: "Datos del usuario",
    evidence: "Dato temporal de revisión E2E",
  });
  const first = await rpc(webApp.page, "nutrition:food-save", [
    id,
    input("Entrada original"),
  ]);
  expect(first.status).toBe(200);
  await webApp.page.locator(".data-portability summary").click();
  const jsonDownload = webApp.page.waitForEvent("download");
  await webApp.page.getByRole("button", { name: "Descargar JSON" }).click();
  const originalExport = await jsonDownload;
  const exportPath = join(webApp.directory, "profile-export.json");
  await writeFile(exportPath, await readFile((await originalExport.path())!));

  const second = await rpc(webApp.page, "nutrition:food-save", [
    id,
    input("Entrada temporal"),
  ]);
  expect(second.status).toBe(200);
  await webApp.page.reload();
  await expect(
    webApp.page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
  await webApp.page.locator(".data-portability summary").click();
  webApp.page.once("dialog", (dialog) => void dialog.accept());
  await webApp.page.locator(".portability-upload input").setInputFiles(exportPath);
  const importStatus = webApp.page
    .getByRole("status")
    .filter({ hasText: "Datos importados. Se creó el respaldo previo" });
  await expect(importStatus).toBeVisible();
  expect((await webApp.snapshot()).entries.map((entry) => entry.name)).toEqual([
    "Entrada original",
  ]);
  const importedBackupId = (await importStatus.innerText()).match(
    /[0-9a-f]{8}-[0-9a-f-]{27}/i,
  )?.[0];
  expect(importedBackupId).toBeTruthy();

  const importedBackupRow = webApp.page
    .locator(".backup-management li")
    .filter({ hasText: importedBackupId! });
  const backupDownloadPromise = webApp.page.waitForEvent("download");
  await importedBackupRow.getByRole("button", { name: "Descargar" }).click();
  const backupDownload = await backupDownloadPromise;
  const downloadedSnapshot = JSON.parse(
    await readFile((await backupDownload.path())!, "utf8"),
  );
  expect(
    downloadedSnapshot.entries.map((entry: { name: string }) => entry.name),
  ).toEqual(["Entrada original", "Entrada temporal"]);

  webApp.page.once("dialog", (dialog) => void dialog.accept());
  await importedBackupRow.getByRole("button", { name: "Restaurar" }).click();
  await expect(webApp.page.locator(".data-portability .waist-notice")).toContainText(
    "Respaldo restaurado. Se creó la copia previa",
  );
  expect((await webApp.snapshot()).entries.map((entry) => entry.name)).toEqual([
    "Entrada original",
    "Entrada temporal",
  ]);
  const backupList = await rpc(webApp.page, "nutrition:backups", [id]);
  expect(backupList.status).toBe(200);
  expect(backupList.body.data.length).toBe(2);

  const traversal = await rpc(webApp.page, "nutrition:backup-download", [
    id,
    "../../profiles.json",
  ]);
  expect(traversal.status).toBe(400);
  expect(await readFile(join(webApp.directory, "profiles.json"), "utf8")).toContain(id);
  const portability = webApp.page.locator(".data-portability");

  if (!(await portability.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await portability.locator("summary").click();
  }

  const policy = webApp.page.locator(".retention-controls");
  await policy.locator("select").nth(0).selectOption("30");
  await policy.locator("select").nth(1).selectOption("30");
  await policy.getByRole("button", { name: "Guardar retención" }).click();
  await expect(
    webApp.page.getByText("Preferencias de retención guardadas."),
  ).toBeVisible();
  const backupDirectory = join(webApp.directory, "profiles", id, "backups");
  const names = await readdir(backupDirectory);
  const oldBackup = names.find((name) => name.includes(importedBackupId!))!;
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  await utimes(join(backupDirectory, oldBackup), oldTime, oldTime);
  const afterBackupRetention = await rpc(webApp.page, "nutrition:backups", [id]);
  expect(
    afterBackupRetention.body.data.map((backup: { id: string }) => backup.id),
  ).not.toContain(importedBackupId);
  await expect(
    readFile(join(backupDirectory, oldBackup), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });

  const trashItem = await rpc(webApp.page, "nutrition:food-save", [
    id,
    input("Papelera antigua"),
  ]);
  expect(trashItem.status).toBe(200);
  await webApp.page.reload();
  await webApp.page.getByRole("button", { name: "Eliminar Papelera antigua" }).click();
  const storage = join(webApp.directory, "profiles", id, "nutrition.json");
  const state = JSON.parse(await readFile(storage, "utf8"));
  state.deletedEntries[0].deletedAt = oldTime.toISOString();
  await writeFile(storage, JSON.stringify(state, null, 2));
  const expiredTrash = await rpc(webApp.page, "nutrition:trash", [id]);
  expect(expiredTrash.body.data).toEqual([]);

  const permanent = await rpc(webApp.page, "nutrition:food-save", [
    id,
    input("Borrado explícito"),
  ]);
  expect(permanent.status).toBe(200);
  await webApp.page.reload();
  await webApp.page.getByRole("button", { name: "Eliminar Borrado explícito" }).click();
  await webApp.page.getByText("Registros eliminados · 1", { exact: true }).click();
  webApp.page.once("dialog", (dialog) => void dialog.accept());
  await webApp.page
    .getByRole("button", { name: "Eliminar definitivamente Borrado explícito" })
    .click();
  await expect(
    webApp.page.getByText("Registro eliminado definitivamente."),
  ).toBeVisible();
  expect((await webApp.snapshot()).deletedEntries).toEqual([]);
});
