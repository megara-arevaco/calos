import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { catalogue } from "../../../packages/core/src/nutrition/catalogue.js";
const chicken = catalogue.find(
  (food) =>
    food.description ===
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
)!;

const image = {
  name: "plato.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};

const draft = {
  dishName: "Pollo asado",
  meal: "Cena",
  foods: [
    {
      name: "Pollo asado",
      grams: 180,
      quantityOrigin: "visual",
      queries: ["chicken breast meat cooked roasted"],
    },
  ],
  assumptions: ["Peso deducido de la imagen."],
  questions: ["¿Te has comido todo el plato?"],
};

test("foto de plato: aclarar, corregir cantidad y registrar con procedencia aproximada", async ({
  desktop,
}) => {
  const page = desktop.page;
  await page.getByLabel("Foto de plato", { exact: true }).setInputFiles(image);
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: { intent: "clarify", message: "Revisa la propuesta.", draft },
    },
  ]);
  await send(page, "¿Qué hay en este plato?");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "¿Te has comido todo el plato?",
  );
  expect((await desktop.snapshot()).entries).toEqual([]);
  await expect(page.getByAltText("Plato adjunto")).toBeVisible();
  const confirmed = {
    ...draft,
    foods: [{ ...draft.foods[0], grams: 150, quantityOrigin: "user" }],
    assumptions: ["Pollo identificado visualmente; peso indicado por el usuario."],
    questions: [],
  };
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: {
        intent: "record",
        message: "Preparado.",
        draft: confirmed,
      },
    },
    { name: "plate_answers", content: { answeredIndices: [0] } },
    {
      name: "meal_matches",
      content: {
        matches: [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
        clarification: null,
      },
    },
  ]);
  await send(page, "Sí, todo, pero eran 150 g de pollo. De cena.");
  await expect(page.getByRole("article")).toContainText("Pollo asado");
  await expect(page.getByRole("article")).toContainText("aproximad");
  await expect(page.getByAltText("Plato adjunto")).toHaveCount(0);
  const entry = (await desktop.snapshot()).entries[0];
  expect(entry.source).toMatchObject({
    provider: "USDA FoodData Central",
    grams: 150,
    photoEstimate: { estimatedGrams: false },
  });
  expect(entry.meal).toBe("Cena");
  const requests = await desktop.requests();
  const content = requests[1].messages[1].content as unknown as {
    type: string;
    text?: string;
  }[];
  expect(content.some((item) => item.type === "image_url")).toBe(true);
  expect(
    JSON.parse(content.find((item) => item.type === "text")!.text!).previousDraft,
  ).toEqual(draft);
  await desktop.mock([
    {
      name: "meal_interpretation",
      content: {
        action: "correct",
        clarification: null,
        foods: [
          {
            entryId: entry.id,
            name: "Pollo asado",
            queries: ["chicken"],
            grams: 200,
            milliliters: null,
            label: null,
            portionCount: null,
            portionDescription: null,
            meal: "Cena",
            keepSource: true,
          },
        ],
      },
    },
  ]);
  await send(page, "Corrige el pollo: eran 200 g");
  expect((await desktop.snapshot()).entries[0].source?.photoEstimate).toEqual(
    entry.source?.photoEstimate,
  );
  await desktop.restart();
  expect((await desktop.snapshot()).entries[0].source?.photoEstimate).toEqual(
    entry.source?.photoEstimate,
  );
  await expect(desktop.page.getByRole("article")).toContainText("aproximad");
});

test("foto de plato: borrador incompleto, error y cancelación no guardan comida", async ({
  desktop,
}) => {
  const page = desktop.page;
  await page.getByLabel("Foto de plato", { exact: true }).setInputFiles(image);
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: {
        intent: "record",
        message: "Falta la cantidad.",
        draft: { ...draft, foods: [{ ...draft.foods[0], grams: null }] },
      },
    },
  ]);
  await send(page, "Registra esta cena");
  expect((await desktop.snapshot()).entries).toEqual([]);
  await desktop.mock([{ name: "plate_interpretation", status: 429 }]);
  await send(page, "He comido todo");
  await expect(page.getByAltText("Plato adjunto")).toBeVisible();
  expect((await desktop.snapshot()).entries).toEqual([]);
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: { intent: "cancel", message: "Cancelado.", draft },
    },
  ]);
  await send(page, "Cancela, no lo registres");
  await expect(page.getByAltText("Plato adjunto")).toHaveCount(0);
  expect((await desktop.snapshot()).entries).toEqual([]);
});

test("foto: conservar preguntas omitidas y rechazar confirmaciones inventadas", async ({
  desktop,
}) => {
  const page = desktop.page;
  await page.getByLabel("Foto de plato", { exact: true }).setInputFiles(image);
  const pending = {
    ...draft,
    questions: ["¿Te has comido todo?", "¿Había arroz debajo?"],
  };
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: {
        intent: "clarify",
        message: "He registrado el plato.",
        draft: { ...pending, questions: [] },
      },
    },
  ]);
  await send(page, "Analiza la foto");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "No he guardado ninguna comida",
  );
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: { intent: "clarify", message: "Aclara las dudas.", draft: pending },
    },
  ]);
  await send(page, "¿Qué necesitas saber?");
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: {
        intent: "record",
        message: "Listo.",
        draft: { ...pending, questions: [] },
      },
    },
  ]);
  await desktop.mock([{ name: "plate_answers", content: { answeredIndices: [0] } }]);
  await send(page, "He comido todo");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "¿Había arroz debajo?",
  );
  expect((await desktop.snapshot()).entries).toEqual([]);
  await desktop.mock([
    {
      name: "plate_interpretation",
      content: {
        intent: "record",
        message: "Listo.",
        draft: { ...pending, questions: [] },
      },
    },
    { name: "plate_answers", content: { answeredIndices: [0] } },
    {
      name: "meal_matches",
      content: {
        matches: [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
        clarification: null,
      },
    },
  ]);
  await send(page, "No había arroz debajo");
  expect((await desktop.snapshot()).entries).toHaveLength(1);
  expect(
    (await desktop.snapshot()).entries[0].source?.photoEstimate?.estimatedGrams,
  ).toBe(true);
});
