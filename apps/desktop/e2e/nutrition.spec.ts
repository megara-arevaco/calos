import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";
const chicken = catalogue.find(
  (food) =>
    food.description ===
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
)!;

const food = {
  name: "Pollo asado",
  queries: ["chicken breast meat cooked roasted"],
  grams: 100,
  milliliters: null,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: "Comida",
};

const mealReplies = [
  { name: "meal_interpretation", content: { foods: [food], clarification: null } },
  {
    name: "meal_matches",
    content: {
      matches: [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
      clarification: null,
    },
  },
];

test("chat: registrar USDA, corregir cantidad, persistir y eliminar del diario e historial", async ({
  desktop,
}) => {
  let page = desktop.page;
  await desktop.mock(mealReplies);
  await send(page, "He comido 100 g de pechuga de pollo asada");
  const row = page.getByRole("article");
  await expect(row).toContainText("Pollo asado");
  await expect(row).toContainText(`${chicken.per100g.calories} kcal`);
  await row.getByText("Referencia USDA", { exact: true }).click();
  await expect(row).toContainText(`FDC ${chicken.fdcId}`);
  const original = (await desktop.snapshot()).entries[0];
  expect(original.source).toMatchObject({ fdcId: chicken.fdcId, grams: 100 });
  await desktop.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        clarification: null,
        foods: [{ ...food, grams: 200, entryId: original.id, keepSource: true }],
      },
    },
  ]);
  await send(page, "Fueron 200 g de pollo asado, no 100 g");
  await expect(row).toContainText(`${chicken.per100g.calories * 2} kcal`);
  await expect(page.locator(".calorie-panel").locator("strong")).toHaveText(
    String(chicken.per100g.calories * 2),
  );
  await expect(
    page.locator(".macro").filter({ hasText: "Proteína" }).locator("strong"),
  ).toHaveText(`${Math.round(chicken.per100g.protein * 2 * 10) / 10} g`);
  expect((await desktop.snapshot()).entries).toHaveLength(1);
  expect((await desktop.snapshot()).entries[0]).toMatchObject({
    id: original.id,
    calories: chicken.per100g.calories * 2,
  });
  await desktop.restart();
  page = desktop.page;
  await expect(page.getByRole("article")).toContainText("Pollo asado");
  const history = page.getByRole("region", { name: "Historial de comidas" });
  await expect(history.getByRole("button")).toHaveCount(1);
  await page.getByLabel("Consultar fecha").fill("2026-01-01");
  await expect(
    page.getByRole("heading", { name: "No hay comidas en esta fecha" }),
  ).toBeVisible();
  await history.getByRole("button").click();
  await expect(page.getByRole("article")).toContainText("Pollo asado");
  await page.getByRole("button", { name: "Eliminar Pollo asado" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(history.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".calorie-panel").locator("strong")).toHaveText("0");
  expect((await desktop.snapshot()).entries).toEqual([]);
  await desktop.restart();
  await expect(
    desktop.page.getByRole("heading", { name: "Tu diario está preparado" }),
  ).toBeVisible();
});

test("chat: pedir aclaración y recuperar un error del proveedor sin escrituras parciales", async ({
  desktop,
}) => {
  const page = desktop.page;
  await desktop.mock([
    {
      name: "meal_interpretation",
      content: { foods: [], clarification: "¿Cuántos gramos de pollo has comido?" },
    },
  ]);
  await send(page, "He comido pollo");
  await expect(
    page.getByText("¿Cuántos gramos de pollo has comido?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await desktop.mock([mealReplies[0], { name: "meal_matches", status: 429 }]);
  await send(page, "100 g de pechuga asada");
  await expect(
    page.getByText(
      "OpenRouter ha alcanzado el límite de peticiones. Prueba dentro de un momento.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await desktop.mock(mealReplies);
  await send(page, "100 g de pechuga asada");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect((await desktop.snapshot()).entries).toHaveLength(1);
  const requests = await desktop.requests();
  const context = JSON.parse(requests[1].messages[1].content);
  expect(context.history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ text: "¿Cuántos gramos de pollo has comido?" }),
    ]),
  );
});

test("chat sin clave: mostrar configuración sin registrar comidas", async ({
  desktop,
}) => {
  await desktop.close();
  await desktop.launch("");
  await send(desktop.page, "100 g de pollo asado");
  await expect(
    desktop.page.getByText(
      "Configura OPENROUTER_API_KEY en el archivo .env y reinicia Calos para activar el asistente.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  expect(await desktop.requests()).toEqual([]);
});

test("consulta: responder sobre comidas registradas sin convertir la conversación en un registro", async ({
  desktop,
}) => {
  await desktop.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "answer",
        foods: [],
        clarification:
          "No tienes comidas registradas hoy. Puedes consultar otros días desde el historial.",
      },
    },
  ]);
  await send(desktop.page, "¿Qué comidas tengo registradas hoy?");
  await expect(desktop.page.locator(".message.assistant").last()).toHaveText(
    "No tienes comidas registradas hoy. Puedes consultar otros días desde el historial.",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  await desktop.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "answer",
        foods: [],
        clarification: "He registrado el risotto de setas.",
      },
    },
  ]);
  await send(desktop.page, "¿Lo has registrado?");
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No he aplicado cambios",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
});
