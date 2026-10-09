import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";
const bread = catalogue.find((f) => f.fdcId === 174924)!;
const milk = catalogue.find((f) => f.fdcId === 171267)!;

const parsed = (
  name: string,
  grams: number | null,
  milliliters: number | null,
  queries: string[],
) => ({
  name,
  grams,
  milliliters,
  queries,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: "Desayuno",
});

const foods = [
  parsed("Pan", 86, null, ["white bread commercially prepared"]),
  parsed("Lomo ibérico de bellota", 60, null, ["cured iberian pork loin"]),
  parsed("Leche de vaca semidesnatada", null, 350, ["milk reduced fat fluid"]),
];

const density = {
  name: "volume_conversion",
  content: {
    foods: [
      {
        index: 2,
        gramsPerMilliliter: 1.03,
        assumption: "Densidad típica aproximada de leche: 1,03 g/ml.",
      },
    ],
  },
};

const estimate = {
  calories: 300,
  protein: 40,
  carbs: 1,
  fat: 15,
  reason: "Producto curado sin referencia compatible",
  assumptions: ["Lomo curado ibérico de bellota; composición típica aproximada."],
};

test("cantidades: aceptar gr y ml en una comida mixta con aviso de conversión", async ({
  webApp,
}) => {
  const page = webApp.page;
  await webApp.mock([
    { name: "meal_interpretation", content: { foods, clarification: null } },
    density,
    {
      name: "meal_matches",
      content: {
        matches: [
          { index: 0, fdcId: bread.fdcId, portionIndex: null },
          { index: 2, fdcId: milk.fdcId, portionIndex: null },
        ],
        clarification: "El lomo curado no tiene una referencia compatible.",
      },
    },
    { name: "meal_estimation", content: { foods: [{ index: 1, estimate }] } },
  ]);
  await send(
    page,
    "86gr de pan, 60gr de lomo iberico de bellota y 350ml de leche de vaca semidesnatada",
  );
  await expect(page.getByRole("article")).toHaveCount(3);
  const milkRow = page.getByRole("article").filter({ hasText: "Leche de vaca" });
  await expect(milkRow).toContainText("350 ml");
  await expect(milkRow).toContainText("Valores aproximados");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "conversión de volumen a peso aproximada",
  );
  const entries = (await webApp.snapshot()).entries;
  expect(entries.map((e) => e.quantity)).toEqual(["86 g", "60 g", "350 ml"]);
  expect(entries[2].source).toMatchObject({
    grams: 360.5,
    volumeEstimate: { milliliters: 350, gramsPerMilliliter: 1.03 },
  });
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        clarification: null,
        foods: [
          { ...foods[2], entryId: entries[2].id, keepSource: true, milliliters: 500 },
        ],
      },
    },
  ]);
  await send(page, "La leche eran 500 ml, corrige la cantidad");
  const corrected = (await webApp.snapshot()).entries[2];
  expect(corrected).toMatchObject({
    id: entries[2].id,
    quantity: "500 ml",
    source: { grams: 515, volumeEstimate: { milliliters: 500 } },
  });
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        clarification: null,
        foods: [
          {
            ...foods[2],
            grams: null,
            milliliters: null,
            entryId: entries[2].id,
            keepSource: true,
            meal: "Comida",
          },
        ],
      },
    },
  ]);
  await send(page, "Cambia la leche a comida");
  expect((await webApp.snapshot()).entries[2]).toMatchObject({
    quantity: "500 ml",
    meal: "Comida",
    source: corrected.source,
  });
  await webApp.restart();
  await expect(
    webApp.page.getByRole("article").filter({ hasText: "Leche de vaca" }),
  ).toContainText("500 ml");
  expect((await webApp.snapshot()).entries[2].source).toEqual(corrected.source);
});

test("volumen: pedir solo el líquido cuando se exige precisión y no guardar parcialmente", async ({
  webApp,
}) => {
  await webApp.mock([
    { name: "meal_interpretation", content: { foods, clarification: null } },
  ]);
  await send(
    webApp.page,
    "Sin estimaciones: 86gr de pan, 60gr de lomo iberico de bellota y 350ml de leche de vaca semidesnatada",
  );
  await expect(webApp.page.locator(".message.assistant").last()).toContainText(
    "350 ml de Leche de vaca semidesnatada",
  );
  await expect(webApp.page.locator(".message.assistant").last()).toContainText(
    "valores nutricionales por 100 ml",
  );
  expect((await webApp.snapshot()).entries).toEqual([]);
  expect(await webApp.requests()).toHaveLength(1);
});

test("volumen: rechazar una densidad inválida sin guardar ningún alimento", async ({
  webApp,
}) => {
  await webApp.mock([
    { name: "meal_interpretation", content: { foods, clarification: null } },
    {
      name: "volume_conversion",
      content: {
        foods: [{ index: 2, gramsPerMilliliter: -1, assumption: "Densidad inválida" }],
      },
    },
  ]);
  await send(webApp.page, "86gr de pan, 60gr de lomo y 350ml de leche");
  expect((await webApp.snapshot()).entries).toEqual([]);
  await expect(webApp.page.locator(".message.assistant").last()).toContainText(
    "No se ha guardado",
  );
});

test("volumen: usar directamente los datos por 100 ml de una etiqueta, sin estimar densidad", async ({
  webApp,
}) => {
  const page = webApp.page;
  await page.getByLabel("Foto de etiqueta nutricional").setInputFiles({
    name: "leche.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          {
            ...foods[2],
            label: {
              basis: "100ml",
              servingGrams: null,
              kilojoules: null,
              calories: 46,
              protein: 3.2,
              carbs: 4.8,
              fat: 1.5,
              evidence: "Etiqueta: valores por 100 ml",
            },
          },
        ],
        clarification: null,
      },
    },
  ]);
  await send(page, "350 ml de esta leche, sin estimaciones");
  expect((await webApp.snapshot()).entries[0]).toMatchObject({
    quantity: "350 ml",
    calories: 161,
    source: { provider: "Etiqueta nutricional", basis: "100ml", amount: 350 },
  });
  expect((await webApp.snapshot()).entries[0].source?.volumeEstimate).toBeUndefined();
  expect(await webApp.requests()).toHaveLength(1);
});

test("referencia personal: recalcular nutrientes conservando ml y su procedencia", async ({
  webApp,
}) => {
  const page = webApp.page;
  const evidence =
    "por 100 g: calorías 40 kcal, proteínas 3 g, carbohidratos 5 g, grasas 1 g";
  const nutrition = {
    basisGrams: 100,
    calories: { min: 40, max: 40 },
    protein: { min: 3, max: 3 },
    carbs: { min: 5, max: 5 },
    fat: { min: 1, max: 1 },
    evidence,
  };
  const referenceFood = {
    ...parsed("Bebida casera", null, null, ["homemade drink"]),
    customNutrition: nutrition,
    saveOnly: true,
  };
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: { foods: [referenceFood], clarification: null },
    },
  ]);
  await send(page, `Guarda solo la referencia de bebida casera, ${evidence}`);
  const reference = (await webApp.snapshot()).customFoods[0];
  expect(reference).toBeDefined();
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        foods: [
          {
            ...parsed("Bebida casera", null, 350, ["homemade drink"]),
            customFoodId: reference.id,
          },
        ],
        clarification: null,
      },
    },
    {
      name: "volume_conversion",
      content: {
        foods: [
          {
            index: 0,
            gramsPerMilliliter: 1.03,
            assumption: "Densidad aproximada de la bebida.",
          },
        ],
      },
    },
  ]);
  await send(page, "Registra 350 ml de bebida casera");
  const original = (await webApp.snapshot()).entries[0];
  expect(original.quantity).toBe("350 ml");
  const correctedEvidence =
    "por 100 g: calorías 50 kcal, proteínas 3 g, carbohidratos 5 g, grasas 1 g";
  await webApp.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        foods: [
          {
            ...referenceFood,
            customFoodId: reference.id,
            customNutrition: {
              ...nutrition,
              calories: { min: 50, max: 50 },
              evidence: correctedEvidence,
            },
          },
        ],
        clarification: null,
      },
    },
  ]);
  await send(
    page,
    `Corrige la referencia de bebida casera y todos sus consumos: ${correctedEvidence}`,
  );
  const corrected = (await webApp.snapshot()).entries[0];
  expect(corrected).toMatchObject({
    id: original.id,
    quantity: "350 ml",
    calories: 180,
  });
  expect(corrected.source?.volumeEstimate).toEqual(original.source?.volumeEstimate);
  await expect(page.getByRole("article")).toContainText("350 ml");
  await expect(page.getByRole("article")).toContainText("Valores aproximados");
});
