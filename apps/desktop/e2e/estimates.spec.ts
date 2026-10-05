import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";
const chicken = catalogue.find(
  (food) =>
    food.description ===
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
)!;

const estimate = {
  calories: 160,
  protein: 4,
  carbs: 22,
  fat: 6,
  reason: "No hay una receta exacta del risotto.",
  assumptions: [
    "Arroz cocido con setas, queso y algo de grasa; proporciones desconocidas.",
  ],
};

const risotto = {
  name: "Risotto de setas",
  queries: ["unfindablewordzzzz"],
  grams: 300,
  milliliters: null,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: "Cena",
};

const poultry = {
  ...risotto,
  name: "Pollo asado",
  queries: ["chicken breast meat cooked roasted"],
  grams: 100,
  meal: "Comida",
};

const interpretation = (foods: unknown[]) => ({
  name: "meal_interpretation",
  content: { foods, clarification: null },
});

const fallback = (value = estimate, index = 1) => ({
  name: "meal_estimation",
  content: { foods: [{ index, estimate: value }] },
});

const chickenMatch = {
  name: "meal_matches",
  content: {
    matches: [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
    clarification: null,
  },
};

test("risotto: registrar una estimación con aviso, corregir cantidad y conservar su procedencia al reiniciar", async ({
  desktop,
}) => {
  await desktop.mock([interpretation([{ ...risotto, estimate }])]);
  await send(desktop.page, "Añade de cena 300 g de risotto de setas");
  let row = desktop.page.getByRole("article");
  await expect(row).toContainText("480 kcal");
  await expect(
    row.getByText("Valores aproximados · estimación del asistente"),
  ).toBeVisible();
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "Aviso:",
  );
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "valores aproximados",
  );
  await expect(desktop.page.locator(".meal-group h3")).toContainText("Cena");
  await row.getByText("Estimación aproximada", { exact: true }).click();
  await expect(row).toContainText(estimate.assumptions[0]);
  const original = (await desktop.snapshot()).entries[0];
  expect(original).toMatchObject({
    meal: "Cena",
    calories: 480,
    source: {
      provider: "Estimación",
      assumptions: estimate.assumptions,
      perBasis: { calories: 160 },
    },
  });
  expect((await desktop.snapshot()).customFoods).toEqual([]);
  await desktop.mock([
    interpretation([
      {
        ...risotto,
        estimate: null,
        grams: 200,
        entryId: original.id,
        keepSource: true,
      },
    ]),
  ]);
  await send(desktop.page, "Fueron 200 g de risotto, no 300 g");
  await expect(row).toContainText("320 kcal");
  expect((await desktop.snapshot()).entries).toHaveLength(1);
  expect((await desktop.snapshot()).entries[0]).toMatchObject({
    id: original.id,
    source: { provider: "Estimación", assumptions: estimate.assumptions },
  });
  await desktop.restart();
  row = desktop.page.getByRole("article");
  await expect(row).toContainText("320 kcal");
  await expect(
    row.getByText("Valores aproximados · estimación del asistente"),
  ).toBeVisible();
  await row.getByText("Estimación aproximada", { exact: true }).click();
  await expect(row).toContainText(estimate.assumptions[0]);
});

test("USDA sin referencia: estimar solo el plato desconocido y conservar el cálculo exacto del otro alimento", async ({
  desktop,
}) => {
  await desktop.mock([interpretation([poultry, risotto]), fallback(), chickenMatch]);
  await send(desktop.page, "Registra 100 g de pollo asado y 300 g de risotto de setas");
  await expect(desktop.page.getByRole("article")).toHaveCount(2);
  const entries = (await desktop.snapshot()).entries;
  expect(entries[0]).toMatchObject({
    name: "Pollo asado",
    calories: chicken.per100g.calories,
    source: { provider: "USDA FoodData Central" },
  });
  expect(entries[1]).toMatchObject({
    name: "Risotto de setas",
    calories: 480,
    source: { provider: "Estimación" },
  });
  await expect(desktop.page.locator(".calorie-panel strong")).toHaveText(
    String(chicken.per100g.calories + 480),
  );
});

test("USDA con candidatos incompatibles: estimar sin atribuir los valores a USDA", async ({
  desktop,
}) => {
  await desktop.mock([
    interpretation([{ ...risotto, queries: ["rice cooked"] }]),
    {
      name: "meal_matches",
      content: { matches: [], clarification: "No hay un risotto equivalente." },
    },
    fallback(estimate, 0),
  ]);
  await send(desktop.page, "Añade de cena 300 g de risotto de setas");
  await expect(desktop.page.getByRole("article")).toContainText("480 kcal");
  expect((await desktop.snapshot()).entries[0].source?.provider).toBe("Estimación");
});

test("estimación inválida: no guardar parcialmente la comida y permitir volver a intentarlo", async ({
  desktop,
}) => {
  await desktop.mock([
    interpretation([poultry, risotto]),
    fallback({ ...estimate, protein: 80, carbs: 80 }),
  ]);
  await send(desktop.page, "Registra 100 g de pollo asado y 300 g de risotto de setas");
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No se ha guardado ningún registro",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  await desktop.mock([interpretation([poultry, risotto]), fallback(), chickenMatch]);
  await send(desktop.page, "Registra 100 g de pollo asado y 300 g de risotto de setas");
  await expect(desktop.page.getByRole("article")).toHaveCount(2);
  expect((await desktop.snapshot()).entries).toHaveLength(2);
});

test("foto: no estimar una etiqueta ilegible y dar prioridad a sus valores cuando se puede leer", async ({
  desktop,
}) => {
  await desktop.page.getByLabel("Foto de etiqueta nutricional").setInputFiles({
    name: "etiqueta.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await desktop.mock([interpretation([{ ...risotto, estimate }])]);
  await send(
    desktop.page,
    "Registra 300 g de este risotto con los datos de la etiqueta",
  );
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No he podido leer la etiqueta",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  await expect(desktop.page.getByRole("button", { name: "Quitar foto" })).toBeVisible();
  await desktop.mock([
    interpretation([
      {
        ...risotto,
        estimate,
        label: {
          basis: "100g",
          servingGrams: null,
          calories: 100,
          kilojoules: null,
          protein: 3,
          carbs: 15,
          fat: 3,
          evidence: "100 kcal, P 3 g, C 15 g, G 3 g por 100 g",
        },
      },
    ]),
  ]);
  await send(desktop.page, "La etiqueta indica 100 kcal por 100 g; he comido 300 g");
  await expect(desktop.page.getByRole("article")).toContainText("300 kcal");
  await expect(
    desktop.page.getByText("Valores aproximados · estimación del asistente"),
  ).toHaveCount(0);
  expect((await desktop.snapshot()).entries[0].source?.provider).toBe(
    "Etiqueta nutricional",
  );
  await expect(
    desktop.page.getByRole("button", { name: "Adjuntar etiqueta" }),
  ).toBeVisible();
});

test("petición de precisión: no estimar y conservar esa preferencia al continuar la aclaración", async ({
  desktop,
}) => {
  await desktop.mock([interpretation([risotto])]);
  await send(desktop.page, "Registra 300 g de risotto de setas, sin estimaciones");
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No encuentro una referencia exacta",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  await desktop.mock([interpretation([risotto])]);
  await send(desktop.page, "Lleva arroz y crema de queso");
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No he guardado una estimación",
  );
  expect(await desktop.requests()).toHaveLength(2);
  const requests = await desktop.requests();
  expect(JSON.parse(requests[1].messages[1].content).estimationAllowed).toBe(false);
  await desktop.mock([interpretation([{ ...risotto, estimate }])]);
  await send(desktop.page, "Vale, puedes estimar el risotto");
  await expect(desktop.page.getByRole("article")).toContainText("480 kcal");
});

test("fuente exacta: preferir USDA aunque el modelo también devuelva una estimación", async ({
  desktop,
}) => {
  await desktop.mock([interpretation([{ ...poultry, estimate }]), chickenMatch]);
  await send(desktop.page, "Registra 100 g de pollo asado");
  await expect(desktop.page.getByRole("article")).toContainText(
    `${chicken.per100g.calories} kcal`,
  );
  await expect(
    desktop.page.getByText("Valores aproximados · estimación del asistente"),
  ).toHaveCount(0);
  expect((await desktop.snapshot()).entries[0].source?.provider).toBe(
    "USDA FoodData Central",
  );
});

for (const recover of [false, true]) {
  test(`comida mixta: mantener el match exacto cuando el risotto no es compatible${recover ? " y recuperar una selección vacía" : ""}`, async ({
    desktop,
  }) => {
    const partial = {
      name: "meal_matches",
      content: {
        ...chickenMatch.content,
        clarification: "No hay un risotto equivalente.",
      },
    };
    await desktop.mock([
      interpretation([poultry, { ...risotto, queries: ["rice cooked"] }]),
      ...(recover
        ? [
            {
              name: "meal_matches",
              content: {
                matches: [],
                clarification: "No todos los alimentos tienen referencia.",
              },
            },
            { ...partial, name: "meal_match_recovery" },
          ]
        : [partial]),
      fallback(),
    ]);
    await send(
      desktop.page,
      "Registra 100 g de pollo asado y 300 g de risotto de setas",
    );
    await expect(desktop.page.getByRole("article")).toHaveCount(2);
    const entries = (await desktop.snapshot()).entries;
    expect(entries[0].source?.provider).toBe("USDA FoodData Central");
    expect(entries[1].source?.provider).toBe("Estimación");
  });
}

test("procedencia: rechazar cifras inventadas como datos del usuario y aceptar sus valores explícitos", async ({
  desktop,
}) => {
  const message = "Registra 300 g de risotto de setas";
  const customNutrition = {
    basisGrams: 100,
    calories: { min: 160, max: 160 },
    protein: { min: 4, max: 4 },
    carbs: { min: 22, max: 22 },
    fat: { min: 6, max: 6 },
    evidence: message,
  };
  await desktop.mock([interpretation([{ ...risotto, customNutrition }])]);
  await send(desktop.page, message);
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "No he podido verificar los valores",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
  for (const invalid of [
    {
      ...customNutrition,
      fat: { min: 4, max: 4 },
      evidence: "por 100 g: 160 kcal, proteínas 4 g, carbohidratos 22 g",
    },
    {
      ...customNutrition,
      basisGrams: 300,
      evidence:
        "por 100 g: calorías 160 kcal, proteínas 4 g, carbohidratos 22 g, grasas 6 g",
    },
  ]) {
    await desktop.mock([interpretation([{ ...risotto, customNutrition: invalid }])]);
    await send(desktop.page, `Registra 300 g de risotto; ${invalid.evidence}`);
    await expect(desktop.page.locator(".message.assistant").last()).toContainText(
      "No he podido verificar los valores",
    );
    await expect(desktop.page.getByRole("article")).toHaveCount(0);
  }

  const evidence =
    "por 100 g: calorías 160 kcal, proteínas 4 g, carbohidratos 22 g, grasas 6 g";
  await desktop.mock([
    interpretation([
      { ...risotto, estimate, customNutrition: { ...customNutrition, evidence } },
    ]),
  ]);
  await send(desktop.page, `Registra 300 g de risotto; ${evidence}`);
  await expect(desktop.page.getByRole("article")).toContainText("480 kcal");
  expect((await desktop.snapshot()).entries[0].source?.provider).toBe(
    "Datos del usuario",
  );
  await expect(
    desktop.page.getByText("Valores aproximados · estimación del asistente"),
  ).toHaveCount(0);
});

test("corrección de nutrientes: mantener la procedencia aproximada hasta sustituir todos los valores", async ({
  desktop,
}) => {
  await desktop.mock([interpretation([{ ...risotto, estimate }])]);
  await send(desktop.page, "Añade de cena 300 g de risotto de setas");
  const original = (await desktop.snapshot()).entries[0];
  const partialText = "Pon 5 g de grasa por 100 g";
  await desktop.mock([
    interpretation([
      {
        ...risotto,
        entryId: original.id,
        keepSource: true,
        nutrientPatch: {
          basis: "100g",
          calories: null,
          protein: null,
          carbs: null,
          fat: 5,
          evidence: partialText,
        },
      },
    ]),
  ]);
  await send(desktop.page, partialText);
  await expect(desktop.page.getByRole("article")).toContainText("G 15g");
  expect((await desktop.snapshot()).entries[0].source?.provider).toBe("Estimación");
  await expect(
    desktop.page.getByText("Valores aproximados · estimación del asistente"),
  ).toBeVisible();
  const completeText =
    "Corrige por 100 g: calorías 180 kcal, proteínas 4 g, carbohidratos 25 g, grasas 7 g";
  await desktop.mock([
    interpretation([
      {
        ...risotto,
        entryId: original.id,
        keepSource: true,
        nutrientPatch: {
          basis: "100g",
          calories: 180,
          protein: 4,
          carbs: 25,
          fat: 7,
          evidence: completeText,
        },
      },
    ]),
  ]);
  await send(desktop.page, completeText);
  await expect(desktop.page.getByRole("article")).toContainText("540 kcal");
  expect((await desktop.snapshot()).entries[0]).toMatchObject({
    id: original.id,
    source: { provider: "Datos del usuario" },
  });
  await expect(
    desktop.page.getByText("Valores aproximados · estimación del asistente"),
  ).toHaveCount(0);
});

test("selección ambigua: no convertir toda la comida en estimaciones si falla la recuperación de referencias", async ({
  desktop,
}) => {
  await desktop.mock([
    interpretation([poultry, { ...risotto, queries: ["rice cooked"] }]),
    {
      name: "meal_matches",
      content: {
        matches: [],
        clarification: "No todos los alimentos tienen referencia.",
      },
    },
    {
      name: "meal_match_recovery",
      content: { matches: [], clarification: "No puedo identificar los alimentos." },
    },
  ]);
  await send(desktop.page, "Registra 100 g de pollo asado y 300 g de risotto de setas");
  await expect(desktop.page.locator(".message.assistant").last()).toContainText(
    "todavía no he guardado nada",
  );
  await expect(desktop.page.getByRole("article")).toHaveCount(0);
});
