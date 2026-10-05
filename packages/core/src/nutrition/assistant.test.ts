import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { respondToChat } from "./assistant.js";
import { catalogue, searchFoods } from "./catalogue.js";
import { createOpenRouterClient, type JsonCompletion } from "./openrouter.js";
import { NutritionStore } from "./store.js";

const chicken = catalogue.find(
  (food) =>
    food.description ===
    "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
)!;

const rice = catalogue.find(
  (food) => food.description === "Rice, white, long-grain, regular, enriched, cooked",
)!;

const egg = catalogue.find((food) => food.description === "Egg, whole, raw, fresh")!;

const parsedFood = (name: string, query: string, grams: number | null) => ({
  name,
  queries: [query],
  grams,
  milliliters: null,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: "Comida",
});

const mock =
  (
    foods: unknown[],
    matches: unknown[],
    clarification: string | null = null,
  ): JsonCompletion =>
  async (name, schema) =>
    schema.parse(
      name === "meal_interpretation"
        ? { foods, clarification }
        : { matches, clarification: null },
    );

async function withStore(work: (store: NutritionStore) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "calos-assistant-"));

  try {
    await work(new NutritionStore(join(directory, "nutrition.json")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("USDA search distinguishes cooked food and includes exact records", () => {
  assert.equal(catalogue.length, 7793);
  assert.ok(
    searchFoods(["chicken breast meat cooked roasted"]).some(
      (food) => food.fdcId === chicken.fdcId,
    ),
  );
  assert.ok(
    searchFoods(["rice white long grain cooked"]).some(
      (food) => food.fdcId === rice.fdcId,
    ),
  );
  assert.deepEqual(searchFoods(["unfindablewordzzzz"]), []);
});

test("gram quantities scale real dataset nutrients and persist provenance as one meal", async () => {
  await withStore(async (store) => {
    const reply = await respondToChat(
      "100 g de pollo asado y 150 g de arroz blanco cocido",
      store,
      {
        complete: mock(
          [
            parsedFood("Pollo asado", "chicken breast meat cooked roasted", 100),
            parsedFood("Arroz blanco cocido", "rice white long grain cooked", 150),
          ],
          [
            { index: 0, fdcId: chicken.fdcId, portionIndex: null },
            { index: 1, fdcId: rice.fdcId, portionIndex: null },
          ],
        ),
      },
    );
    assert.equal(reply.entriesAdded.length, 2);
    assert.equal(reply.entriesAdded[0].calories, chicken.per100g.calories);
    assert.equal(
      reply.entriesAdded[1].calories,
      Math.round(rice.per100g.calories * 1.5),
    );
    assert.equal(reply.entriesAdded[0].source?.provider, "USDA FoodData Central");
    assert.equal(
      reply.entriesAdded[0].source && "fdcId" in reply.entriesAdded[0].source
        ? reply.entriesAdded[0].source.fdcId
        : null,
      chicken.fdcId,
    );
    assert.equal(
      reply.entriesAdded[0].source && "grams" in reply.entriesAdded[0].source
        ? reply.entriesAdded[0].source.grams
        : null,
      100,
    );
    assert.equal(reply.entriesAdded[1].meal, "Comida");
    assert.equal((await store.read()).entries.length, 2);
  });
});

test("units use the USDA portion weight instead of LLM weight estimates", async () => {
  await withStore(async (store) => {
    const portionIndex = egg.portions.findIndex(
      (portion) => portion.description === "large",
    );
    assert.ok(portionIndex >= 0);
    const portion = egg.portions[portionIndex];
    const reply = await respondToChat("2 huevos grandes crudos", store, {
      complete: mock(
        [
          {
            ...parsedFood("Huevos", "egg whole raw fresh", null),
            portionCount: 2,
            portionDescription: "large egg",
          },
        ],
        [{ index: 0, fdcId: egg.fdcId, portionIndex }],
      ),
    });
    assert.equal(
      reply.entriesAdded[0].source && "grams" in reply.entriesAdded[0].source
        ? reply.entriesAdded[0].source.grams
        : null,
      (2 / portion.amount) * portion.grams,
    );
    assert.match(reply.entriesAdded[0].quantity, /large/);
  });
});

test("clarifications carry chat history and save nothing", async () => {
  await withStore(async (store) => {
    const history = [
      { role: "user" as const, text: "He comido arroz" },
      { role: "assistant" as const, text: "¿Cuántos gramos y crudo o cocido?" },
    ];
    const complete: JsonCompletion = async (_name, schema, _system, user) => {
      assert.deepEqual(JSON.parse(user).history, history);
      return schema.parse({
        clarification: "¿El arroz estaba crudo o cocido?",
        foods: [],
      });
    };
    const reply = await respondToChat("150 g", store, { complete, history });
    assert.match(reply.message, /crudo o cocido/);
    assert.deepEqual((await store.read()).entries, []);
  });
});

test("invalid IDs, duplicate matches and missing amounts never partially save a meal", async () => {
  await withStore(async (store) => {
    const foods = [
      parsedFood("Pollo", "chicken breast meat cooked roasted", 100),
      parsedFood("Arroz", "rice white long grain cooked", 150),
    ];

    for (const matches of [
      [
        { index: 0, fdcId: chicken.fdcId, portionIndex: null },
        { index: 1, fdcId: 999999999, portionIndex: null },
      ],
      [
        { index: 0, fdcId: chicken.fdcId, portionIndex: null },
        { index: 0, fdcId: chicken.fdcId, portionIndex: null },
      ],
      [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
    ]) {
      const reply = await respondToChat("una comida", store, {
        complete: mock(foods, matches),
      });
      assert.deepEqual(reply.entriesAdded, []);
      assert.deepEqual((await store.read()).entries, []);
    }

    const missing = await respondToChat("pollo", store, {
      complete: mock([parsedFood("Pollo", "chicken breast", null)], []),
    });
    assert.match(missing.message, /cantidad/);
    assert.deepEqual((await store.read()).entries, []);
  });
});

test("missing credentials provide setup guidance without fake registrations", async () => {
  await withStore(async (store) => {
    const reply = await respondToChat("200 g de pollo", store);
    assert.match(reply.message, /OPENROUTER_API_KEY/);
    assert.deepEqual((await store.read()).entries, []);
  });
});

test("OpenRouter request uses strict schema, auth and supported-provider routing", async () => {
  const schema = z.object({ message: z.string() }).strict();
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer test-key",
    );
    const request = JSON.parse(options!.body as string);
    assert.equal(request.model, "test/model");
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.provider.require_parameters, true);
    assert.equal(request.messages[1].content, "Hola");
    assert.ok(options?.signal);
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: '{"message":"Hola"}' } }],
    });
  };
  const client = createOpenRouterClient(
    { apiKey: "test-key", model: "test/model" },
    fetcher,
  );
  assert.deepEqual(await client("reply", schema, "System", "Hola"), {
    message: "Hola",
  });
});

test("OpenRouter rejects invalid, truncated, unauthorized and unavailable responses without leaking secrets", async () => {
  const schema = z.object({ message: z.string() }).strict();

  for (const response of [
    new Response("secret-key", { status: 401 }),
    new Response("secret-key", { status: 402 }),
    new Response("secret-key", { status: 429 }),
    Response.json({
      choices: [
        { finish_reason: "length", message: { content: '{"message":"partial"}' } },
      ],
    }),
    Response.json({
      choices: [{ finish_reason: "stop", message: { content: '{"message":7}' } }],
    }),
    Response.json({
      choices: [{ finish_reason: "stop", message: { content: "not json" } }],
    }),
  ]) {
    const client = createOpenRouterClient(
      { apiKey: "secret-key", model: "test/model" },
      async () => response,
    );
    await assert.rejects(
      client("reply", schema, "System", "Hola"),
      (error: Error) => !error.message.includes("secret-key"),
    );
  }

  const client = createOpenRouterClient(
    { apiKey: "secret-key", model: "test/model" },
    async () => {
      throw new Error("secret-key");
    },
  );
  await assert.rejects(client("reply", schema, "System", "Hola"), /conectar/);
});

const label = {
  basis: "100g" as const,
  servingGrams: null,
  calories: 80,
  kilojoules: null,
  protein: 4,
  carbs: 10,
  fat: 2,
  evidence: "Por 100 g: 80 kcal, proteínas 4 g, hidratos 10 g, grasas 2 g",
};

const photo = { mimeType: "image/png" as const, base64: "test-image" };

test("a photo label overrides USDA completely and requires no database match", async () => {
  await withStore(async (store) => {
    let calls = 0;
    const complete: JsonCompletion = async (name, schema, _system, _user, image) => {
      calls++;
      assert.equal(name, "meal_interpretation");
      assert.deepEqual(image, photo);
      return schema.parse({
        clarification: null,
        foods: [{ ...parsedFood("Yogur de la foto", "yogurt", 150), label }],
      });
    };
    const reply = await respondToChat("He tomado 150 g del yogur de la foto", store, {
      complete,
      image: photo,
    });
    assert.equal(calls, 1);
    assert.equal(reply.entriesAdded[0].calories, 120);
    assert.equal(reply.entriesAdded[0].protein, 6);
    assert.equal(reply.entriesAdded[0].source?.provider, "Etiqueta nutricional");
    assert.match(reply.message, /Etiqueta nutricional/);
    assert.equal(
      (await store.read()).entries[0].source?.provider,
      "Etiqueta nutricional",
    );
  });
});

test("a missing or unreadable photo never falls back to USDA silently", async () => {
  await withStore(async (store) => {
    for (const foods of [
      [parsedFood("Pollo", "chicken breast meat cooked roasted", 100)],
      [{ ...parsedFood("Yogur", "yogurt", 150), label: { ...label, protein: null } }],
    ]) {
      const result = await respondToChat("He comido esto", store, {
        image: photo,
        complete: mock(foods, []),
      });
      assert.deepEqual(result.entriesAdded, []);
      assert.deepEqual((await store.read()).entries, []);
    }

    const invented = await respondToChat("150 g de yogur", store, {
      complete: mock([{ ...parsedFood("Yogur", "yogurt", 150), label }], []),
    });
    assert.deepEqual(invented.entriesAdded, []);
    assert.deepEqual((await store.read()).entries, []);
  });
});

test("labels respect per-100ml, per-serving and kJ bases without assuming density", async () => {
  await withStore(async (store) => {
    const liquid = await respondToChat("250 ml de esto", store, {
      image: photo,
      complete: mock(
        [
          {
            ...parsedFood("Bebida", "drink", null),
            milliliters: 250,
            label: { ...label, basis: "100ml" },
          },
        ],
        [],
      ),
    });
    assert.equal(liquid.entriesAdded[0].calories, 200);
    assert.equal(liquid.entriesAdded[0].quantity, "250 ml");
    const serving = await respondToChat("2 raciones", store, {
      image: photo,
      complete: mock(
        [
          {
            ...parsedFood("Barrita", "bar", null),
            portionCount: 2,
            portionDescription: "serving",
            label: { ...label, basis: "serving", calories: null, kilojoules: 418.4 },
          },
        ],
        [],
      ),
    });
    assert.equal(serving.entriesAdded[0].calories, 200);
    assert.equal(serving.entriesAdded[0].quantity, "2 raciones");
    const density = await respondToChat("250 g de bebida", store, {
      image: photo,
      complete: mock(
        [
          {
            ...parsedFood("Bebida", "drink", 250),
            label: { ...label, basis: "100ml" },
          },
        ],
        [],
      ),
    });
    assert.deepEqual(density.entriesAdded, []);
    assert.match(density.message, /ml/);
  });
});

test("a meal can mix a label product and USDA food with independent provenance", async () => {
  await withStore(async (store) => {
    const result = await respondToChat(
      "150 g de yogur de la foto y 100 g de pollo asado",
      store,
      {
        image: photo,
        complete: mock(
          [
            { ...parsedFood("Yogur", "yogurt", 150), label },
            parsedFood("Pollo", "chicken breast meat cooked roasted", 100),
          ],
          [{ index: 0, fdcId: chicken.fdcId, portionIndex: null }],
        ),
      },
    );
    assert.equal(result.entriesAdded.length, 2);
    assert.deepEqual(
      result.entriesAdded.map((item) => item.source?.provider),
      ["Etiqueta nutricional", "USDA FoodData Central"],
    );
    assert.equal(result.entriesAdded[0].calories, 120);
    assert.equal(result.entriesAdded[1].calories, 165);
  });
});

test("OpenRouter sends image inputs as multimodal content", async () => {
  const schema = z.object({ message: z.string() }).strict();
  const client = createOpenRouterClient(
    { apiKey: "test", model: "test/model" },
    async (_url, options) => {
      const content = JSON.parse(options!.body as string).messages[1].content;
      assert.equal(content[0].type, "text");
      assert.equal(content[1].type, "image_url");
      assert.equal(content[1].image_url.url, "data:image/png;base64,test-image");
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"message":"ok"}' } }],
      });
    },
  );
  assert.deepEqual(await client("reply", schema, "System", "Read", photo), {
    message: "ok",
  });
});

test("daily macro totals avoid binary floating-point display artifacts", async () => {
  await withStore(async (store) => {
    const common = {
      name: "Test",
      quantity: "1 g",
      meal: "Snack" as const,
      eatenAt: "2026-10-02T12:00:00Z",
      calories: 1,
      carbs: 0,
      fat: 0,
    };
    await store.addMany([
      { ...common, protein: 0.1 },
      { ...common, protein: 0.2 },
    ]);
    assert.equal((await store.summary("2026-10-02")).total.protein, 0.3);
  });
});

test("transport schemas omit decoder bounds while local validation still enforces them", async () => {
  const schema = z
    .object({ values: z.array(z.number().min(1).max(5)).min(1).max(2) })
    .strict();
  const client = createOpenRouterClient(
    { apiKey: "test", model: "test/model" },
    async (_url, options) => {
      const wire = JSON.parse(options!.body as string).response_format.json_schema
        .schema;
      assert.equal(wire.properties.values.maxItems, undefined);
      assert.equal(wire.properties.values.items.maximum, undefined);
      assert.equal(wire.additionalProperties, false);
      assert.deepEqual(wire.required, ["values"]);
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: '{"values":[100]}' } }],
      });
    },
  );
  await assert.rejects(client("reply", schema, "System", "Read"), /respuesta válida/);
});

test("explicit grams override any unnecessary model-selected portion", async () => {
  await withStore(async (store) => {
    const reply = await respondToChat("100 g de pollo asado", store, {
      complete: mock(
        [parsedFood("Pollo asado", "chicken breast meat cooked roasted", 100)],
        [{ index: 0, fdcId: chicken.fdcId, portionIndex: 0 }],
      ),
    });
    assert.equal(reply.entriesAdded[0].calories, chicken.per100g.calories);
    assert.equal(reply.entriesAdded[0].quantity, "100 g");
  });
});

test("saved user profile and calorie target reach the LLM without the full diary", async () => {
  await withStore(async (store) => {
    await store.updateProfile(
      { heightCm: 183, weightKg: 99, goal: "Pérdida de grasa y ganancia de músculo" },
      2400,
    );
    const state = await store.read();
    assert.equal(state.profile?.heightCm, 183);
    assert.equal(state.profile?.weightKg, 99);
    assert.equal((await store.summary("2026-10-02")).dailyGoal.calories, 2400);
    const complete: JsonCompletion = async (_name, schema, system, user) => {
      assert.match(system, /"heightCm":183/);
      assert.match(system, /"weightKg":99/);
      assert.match(system, /"dailyCalories":2400/);
      assert.match(system, /Pérdida de grasa y ganancia de músculo/);
      assert.equal(JSON.parse(user).message, "¿Cuál es mi objetivo?");
      return schema.parse({
        clarification: "Tu objetivo son 2400 kcal al día.",
        foods: [],
      });
    };
    const reply = await respondToChat("¿Cuál es mi objetivo?", store, { complete });
    assert.match(reply.message, /2400/);
    assert.deepEqual(reply.entriesAdded, []);
  });
});

test("the opened day reaches the chat with authoritative totals and meals", async () => {
  await withStore(async (store) => {
    await store.updateProfile(
      { heightCm: 183, weightKg: 99, goal: "Recomposición" },
      2400,
    );
    const food = {
      name: "Pollo",
      quantity: "100 g",
      meal: "Comida" as const,
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    };
    await store.addMany([
      { ...food, eatenAt: "2026-09-25T12:00:00Z" },
      { ...food, name: "Otra fecha", eatenAt: "2026-09-26T12:00:00Z" },
    ]);
    const complete: JsonCompletion = async (_name, schema, _system, user) => {
      const context = JSON.parse(user).diaryContext;
      assert.equal(context.mode, "day");
      assert.equal(context.date, "2026-09-25");
      assert.deepEqual(
        context.selectedDay.entries.map((item: { name: string }) => item.name),
        ["Pollo"],
      );
      assert.equal(context.selectedDay.total.calories, 165);
      assert.equal(context.selectedDay.remainingCalories, 2235);
      assert.equal(context.days, undefined);
      return schema.parse({
        clarification: "Llevas 165 kcal y te quedan 2235 kcal.",
        foods: [],
      });
    };
    const reply = await respondToChat("¿Cuánto llevo en el día abierto?", store, {
      complete,
      context: { date: "2026-09-25", mode: "day" },
    });
    assert.match(reply.message, /2235/);
    assert.equal((await store.read()).entries.length, 2);
  });
});

test("history mode includes meals across dates and an empty selected day stays empty", async () => {
  await withStore(async (store) => {
    const food = {
      name: "Arroz",
      quantity: "100 g",
      meal: "Comida" as const,
      calories: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
    };
    await store.addMany([
      { ...food, eatenAt: "2026-09-25T12:00:00Z" },
      { ...food, eatenAt: "2026-09-26T12:00:00Z" },
    ]);
    const complete: JsonCompletion = async (_name, schema, _system, user) => {
      const context = JSON.parse(user).diaryContext;
      assert.equal(context.date, "2026-09-24");
      assert.deepEqual(context.selectedDay.entries, []);
      assert.equal(context.selectedDay.total.calories, 0);
      assert.deepEqual(
        context.days.map((day: { date: string }) => day.date),
        ["2026-09-26", "2026-09-25"],
      );
      assert.equal(context.days[0].total.calories, 130);
      assert.equal(context.days[1].entries[0].name, "Arroz");
      return schema.parse({
        clarification: "No hay comidas en el día abierto.",
        foods: [],
      });
    };
    await respondToChat("¿Qué comí ese día?", store, {
      complete,
      context: { date: "2026-09-24", mode: "history" },
      history: [{ role: "assistant", text: "Antes consultabas otra fecha." }],
    });
    assert.equal((await store.read()).entries.length, 2);
  });
});

test("LLM context uses latest weight by measurement date and refreshes after edits and deletions", async () => {
  await withStore(async (store) => {
    await store.updateProfile(
      { heightCm: 183, weightKg: 99, goal: "Pérdida de grasa y ganancia de músculo" },
      2400,
    );
    const newer = await store.saveWeight({ date: "2026-10-02", kilograms: 98.4 });
    await store.saveWeight({ date: "2026-09-25", kilograms: 100 });
    const check = async (weight: number, date?: string) => {
      const complete: JsonCompletion = async (_name, schema, system) => {
        assert.match(system, new RegExp(`"weightKg":${weight}`));
        if (date) {
          assert.ok(system.includes(`"weightMeasurementDate":"${date}"`));
        } else {
          assert.equal(system.includes('"weightMeasurementDate"'), false);
        }
        return schema.parse({ clarification: `Tu peso es ${weight} kg.`, foods: [] });
      };
      await respondToChat("¿Cuánto peso?", store, { complete });
    };
    await check(98.4, "2026-10-02");
    await store.saveWeight({ date: "2026-10-02", kilograms: 98.1 });
    await check(98.1, "2026-10-02");
    await store.removeWeight(newer.id);
    await check(100, "2026-09-25");
    await store.removeWeight((await store.weightHistory())[0].id);
    await check(99);
    assert.equal((await store.read()).profile?.weightKg, 99);
  });
});

test("measurement tabs carry only their fresh dated history and calculated change", async () => {
  await withStore(async (store) => {
    await store.saveWaist({ date: "2026-10-02", centimeters: 90 });
    await store.saveWaist({ date: "2026-09-25", centimeters: 92.5 });
    await store.saveWeight({ date: "2026-10-02", kilograms: 98.4 });
    await store.saveWeight({ date: "2026-09-25", kilograms: 99 });
    const check = async (
      tab: "cintura" | "peso",
      values: number[],
      unit: string,
      change: number | null,
    ) => {
      const complete: JsonCompletion = async (_name, schema, system, user) => {
        const payload = JSON.parse(user);
        assert.equal(payload.diaryContext, undefined);
        assert.equal(payload.tabContext.tab, tab);
        assert.equal(payload.tabContext.unit, unit);
        assert.deepEqual(
          payload.tabContext.measurements.map((item: { value: number }) => item.value),
          values,
        );
        assert.equal(payload.tabContext.change, change);
        assert.equal(payload.tabContext.latest?.value ?? null, values.at(-1) ?? null);
        assert.match(system, /Las medidas no son alimentos/);
        return schema.parse({ clarification: "Esta es tu evolución.", foods: [] });
      };
      const reply = await respondToChat("¿Cómo voy?", store, {
        complete,
        context: { tab, date: "2026-10-02", mode: "day" },
        history: [{ role: "user", text: "Antes hablábamos de comidas." }],
      });
      assert.deepEqual(reply.entriesAdded, []);
    };
    await check("cintura", [92.5, 90], "cm", -2.5);
    await check("peso", [99, 98.4], "kg", -0.6);
    await store.saveWaist({ date: "2026-10-02", centimeters: 89.8 });
    await check("cintura", [92.5, 89.8], "cm", -2.7);
    for (const measurement of await store.waistHistory()) {
      await store.removeWaist(measurement.id);
    }
    await check("cintura", [], "cm", null);
    assert.equal((await store.weightHistory()).length, 2);
  });
});

const trinxatText =
  "Guarda 100 g de trinxat de la Cerdeña y guárdalo en mi base de datos. Valores por 100 g: proteínas 3–5 g, carbohidratos 12–18 g, grasas 5–8 g, calorías 120–150 kcal.";

const trinxatNutrition = {
  basisGrams: 100,
  protein: { min: 3, max: 5 },
  carbs: { min: 12, max: 18 },
  fat: { min: 5, max: 8 },
  calories: { min: 120, max: 150 },
  evidence: trinxatText,
};

test("written nutrition ranges persist with midpoint totals and are reusable without USDA", async () => {
  await withStore(async (store) => {
    const food = {
      ...parsedFood("Trinxat de la Cerdeña", "trinxat", 100),
      customNutrition: trinxatNutrition,
    };
    const reply = await respondToChat(trinxatText, store, {
      complete: mock([food], []),
    });
    assert.equal(reply.entriesAdded[0].calories, 135);
    assert.equal(reply.entriesAdded[0].protein, 4);
    assert.equal(reply.entriesAdded[0].carbs, 15);
    assert.equal(reply.entriesAdded[0].fat, 6.5);
    assert.equal(reply.entriesAdded[0].source?.provider, "Datos del usuario");
    assert.match(reply.message, /punto medio/);
    const saved = (await store.read()).customFoods[0];
    assert.equal(saved.ranges.calories.max, 150);
    const complete: JsonCompletion = async (name, schema, _system, user) => {
      assert.equal(
        name,
        "meal_interpretation",
        "Custom foods do not need USDA matching",
      );
      assert.equal(JSON.parse(user).customFoods[0].id, saved.id);
      return schema.parse({
        clarification: null,
        foods: [{ ...parsedFood(saved.name, "trinxat", 200), customFoodId: saved.id }],
      });
    };
    const next = await respondToChat("He comido 200 g de trinxat", store, { complete });
    assert.equal(next.entriesAdded[0].calories, 270);
    assert.equal(next.entriesAdded[0].fat, 13);
    assert.equal((await store.read()).customFoods.length, 1);
    assert.equal((await store.read()).entries.length, 2);
  });
});

test("saving a personal food alone adds no meal, invalid ranges and incomplete meals save nothing", async () => {
  await withStore(async (store) => {
    const item = {
      ...parsedFood("Trinxat", "trinxat", null),
      customNutrition: trinxatNutrition,
      saveOnly: true,
    };
    const saved = await respondToChat(trinxatText, store, {
      complete: mock([item], []),
    });
    assert.deepEqual(saved.entriesAdded, []);
    assert.equal((await store.read()).entries.length, 0);
    assert.equal((await store.read()).customFoods.length, 1);
    const id = (await store.read()).customFoods[0].id;
    await respondToChat(trinxatText, store, {
      complete: mock(
        [
          {
            ...item,
            customNutrition: { ...trinxatNutrition, protein: { min: 5, max: 3 } },
          },
        ],
        [],
      ),
    });
    await respondToChat(trinxatText, store, {
      complete: mock(
        [
          {
            ...item,
            name: "Otra referencia",
            customNutrition: { ...trinxatNutrition, evidence: "No lo dijo el usuario" },
          },
        ],
        [],
      ),
    });
    await respondToChat(trinxatText, store, {
      complete: mock(
        [
          { ...item, name: "Otra referencia", saveOnly: false, grams: 100 },
          parsedFood("No existe", "unfindablewordzzzz", 100),
        ],
        [],
      ),
    });
    assert.equal((await store.read()).customFoods.length, 1);
    assert.equal((await store.read()).customFoods[0].id, id);
    assert.equal((await store.read()).entries.length, 0);
    await respondToChat(trinxatText, store, {
      complete: mock([{ ...item, grams: null, saveOnly: false }], []),
    });
    assert.equal((await store.read()).entries.length, 0);
  });
});

test("a photo label keeps precedence over written nutrition and saved personal references", async () => {
  await withStore(async (store) => {
    await respondToChat(trinxatText, store, {
      complete: mock(
        [
          {
            ...parsedFood("Trinxat", "trinxat", null),
            customNutrition: trinxatNutrition,
            saveOnly: true,
          },
        ],
        [],
      ),
    });
    const id = (await store.read()).customFoods[0].id;
    const label = {
      basis: "100g",
      servingGrams: null,
      calories: 180,
      kilojoules: null,
      protein: 5,
      carbs: 20,
      fat: 9,
      evidence: "Por 100 g: 180 kcal, P 5, C 20, G 9",
    };
    const reply = await respondToChat("100 g de trinxat de esta etiqueta", store, {
      image: { mimeType: "image/png", base64: "aGVsbG8=" },
      complete: mock(
        [
          {
            ...parsedFood("Trinxat", "trinxat", 100),
            label,
            customFoodId: id,
            customNutrition: trinxatNutrition,
          },
        ],
        [],
      ),
    });
    assert.equal(reply.entriesAdded[0].calories, 180);
    assert.equal(reply.entriesAdded[0].source?.provider, "Etiqueta nutricional");
    assert.equal((await store.read()).customFoods[0].per100g.calories, 135);
  });
});

test("copied catalogue nutrition reuses only an exact saved reference without overwriting it", async () => {
  await withStore(async (store) => {
    await respondToChat(trinxatText, store, {
      complete: mock(
        [
          {
            ...parsedFood("Trinxat", "trinxat", null),
            customNutrition: trinxatNutrition,
            saveOnly: true,
          },
        ],
        [],
      ),
    });
    const copied = {
      ...parsedFood("Trinxat", "trinxat", 200),
      customNutrition: {
        ...trinxatNutrition,
        evidence: "Referencia del catálogo personal",
      },
    };
    const result = await respondToChat("Registra 200 g de trinxat", store, {
      complete: mock([copied], []),
    });
    assert.equal(result.entriesAdded[0].calories, 270);
    assert.equal((await store.read()).customFoods[0].evidence, trinxatText);
    const invalid = {
      ...copied,
      customNutrition: { ...copied.customNutrition, calories: { min: 100, max: 120 } },
    };
    const refused = await respondToChat("Registra 200 g de trinxat", store, {
      complete: mock([invalid], []),
    });
    assert.deepEqual(refused.entriesAdded, []);
    assert.equal((await store.read()).entries.length, 1);
  });
});

test("written user data is accepted if the model also copies it into a label without a photo", async () => {
  await withStore(async (store) => {
    const food = {
      ...parsedFood("Trinxat", "trinxat", null),
      saveOnly: true,
      customNutrition: trinxatNutrition,
      label: {
        basis: "100g",
        servingGrams: null,
        calories: 135,
        kilojoules: null,
        protein: 4,
        carbs: 15,
        fat: 6.5,
        evidence: trinxatText,
      },
    };
    const reply = await respondToChat(trinxatText, store, {
      complete: mock([food], []),
    });
    assert.deepEqual(reply.entriesAdded, []);
    assert.equal((await store.read()).customFoods[0].per100g.calories, 135);
    assert.equal((await store.read()).customFoods[0].ranges.calories.max, 150);
  });
});
