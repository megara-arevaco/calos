import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { respondToChat } from "./assistant.js";
import { catalogue, foodEntry } from "./catalogue.js";
import { customFood, customFoodEntry } from "./custom-food.js";
import { labelEntry } from "./label.js";
import { NutritionStore } from "./store.js";
import type { JsonCompletion } from "./openrouter.js";

const oil = catalogue.find((food) => food.fdcId === 174227)!;
const water = catalogue.find((food) => food.fdcId === 173709)!;
const bread = catalogue.find((food) => food.fdcId === 172675)!;

const item = (id: string | null, name: string, grams: number | null = null) => ({
  entryId: id,
  name,
  queries: ["tuna light canned water drained solids"],
  grams,
  milliliters: null,
  label: null,
  portionCount: null,
  portionDescription: null,
  meal: null,
});

const completeFor =
  (foods: unknown[], fdcId = water.fdcId): JsonCompletion =>
  async (name, schema) =>
    schema.parse(
      name === "meal_interpretation" || name === "meal_correction"
        ? { action: "correct", clarification: null, foods }
        : {
            clarification: null,
            matches: foods.map((_, index) => ({ index, fdcId, portionIndex: null })),
          },
    );

async function withStore(work: (store: NutritionStore) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "calos-corrections-"));

  try {
    await work(new NutritionStore(join(directory, "nutrition.json")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a canned-tuna correction replaces the stored entry and all diary totals without duplicates", async () => {
  await withStore(async (store) => {
    const date = "2026-10-02T13:54:15.453+02:00";
    const [tuna, pan] = await store.addMany([
      foodEntry(oil, "Atún natural sin aceites", 120, "Comida", date),
      foodEntry(bread, "Pan de masa madre", 20, "Comida", date),
    ]);
    const reply = await respondToChat("El atún era de lata al natural", store, {
      complete: completeFor([item(tuna.id, "Atún en lata al natural")]),
    });
    assert.equal(reply.entriesAdded.length, 0);
    assert.equal(reply.entriesUpdated?.length, 1);
    assert.equal(reply.dataChanged, true);
    const corrected = reply.entriesUpdated![0];
    assert.equal(corrected.id, tuna.id);
    assert.equal(corrected.createdAt, tuna.createdAt);
    assert.equal(corrected.eatenAt, date);
    assert.equal(corrected.calories, 103);
    assert.equal(corrected.fat, 1.2);
    assert.equal(corrected.source?.provider, "USDA FoodData Central");
    if (corrected.source?.provider === "USDA FoodData Central") {
      assert.equal(corrected.source.fdcId, water.fdcId);
    }
    assert.equal((await store.read()).entries.length, 2);
    assert.deepEqual(
      (await store.read()).entries.find((entry) => entry.id === pan.id),
      pan,
    );
    assert.equal((await store.summary("2026-10-02")).total.calories, 157);
    assert.equal((await store.foodHistory())[0].total.calories, 157);
    const verify: JsonCompletion = async (_name, schema, _system, user) => {
      const context = JSON.parse(user).diaryContext;
      assert.equal(
        context.selectedDay.entries.find(
          (entry: { id: string }) => entry.id === tuna.id,
        ).fat,
        1.2,
      );
      assert.equal(context.selectedDay.total.calories, 157);
      return schema.parse({
        action: "answer",
        clarification: "Llevas 157 kcal.",
        foods: [],
      });
    };
    await respondToChat("¿Cuánto llevo?", store, {
      complete: verify,
      context: { date: "2026-10-02", mode: "day" },
    });
  });
});

test("quantity and date corrections keep label provenance and recalculate history", async () => {
  await withStore(async (store) => {
    const original = labelEntry(
      {
        basis: "100g",
        servingGrams: null,
        calories: 80,
        kilojoules: null,
        protein: 4,
        carbs: 10,
        fat: 2,
        evidence: "Etiqueta por 100 g",
      },
      {
        name: "Yogur",
        grams: 150,
        milliliters: null,
        portionCount: null,
        portionDescription: null,
      },
      "Snack",
      "2026-10-02T10:00:00+02:00",
    );
    const saved = await store.add(original);
    const corrected = {
      ...item(saved.id, "Yogur", 200),
      keepSource: true,
      eatenDate: "2026-10-01",
    };
    const complete: JsonCompletion = async (name, schema) => {
      assert.ok(name === "meal_interpretation" || name === "meal_correction");
      return schema.parse({
        action: "correct",
        clarification: null,
        foods: [corrected],
      });
    };
    const reply = await respondToChat("Eran 200 g de yogur y fue ayer", store, {
      complete,
    });
    assert.equal(reply.entriesUpdated![0].calories, 160);
    assert.equal(reply.entriesUpdated![0].source?.provider, "Etiqueta nutricional");
    assert.equal((await store.summary("2026-10-02")).entries.length, 0);
    assert.equal((await store.foodHistory())[0].date, "2026-10-01");
    assert.equal((await store.read()).entries.length, 1);
  });
});

test("explicit nutrient patches update a single entry and preserve the other reference values", async () => {
  await withStore(async (store) => {
    const [first, second] = await store.addMany([
      foodEntry(water, "Atún", 120, "Comida", "2026-10-02T12:00:00Z"),
      foodEntry(water, "Atún", 100, "Cena", "2026-10-02T20:00:00Z"),
    ]);
    const text = "Pon 0 g de grasa por 100 g en ese atún";
    const patch = {
      basis: "100g",
      fat: 0,
      calories: null,
      protein: null,
      carbs: null,
      evidence: text,
    };
    const reply = await respondToChat(text, store, {
      complete: completeFor([
        { ...item(first.id, "Atún"), keepSource: true, nutrientPatch: patch },
      ]),
    });
    assert.equal(reply.entriesUpdated![0].fat, 0);
    assert.equal(reply.entriesUpdated![0].protein, first.protein);
    assert.equal(reply.entriesUpdated![0].calories, first.calories);
    assert.equal(reply.entriesUpdated![0].source?.provider, "Datos del usuario");
    assert.deepEqual(
      (await store.read()).entries.find((entry) => entry.id === second.id),
      second,
    );
    assert.equal((await store.read()).customFoods.length, 0);
    const invalid = await respondToChat("No lleva aceite", store, {
      complete: completeFor([
        {
          ...item(first.id, "Atún"),
          keepSource: true,
          nutrientPatch: { ...patch, evidence: "No lleva aceite" },
        },
      ]),
    });
    assert.equal(invalid.entriesUpdated, undefined);
    assert.match(invalid.message, /valores concretos/);
  });
});

test("personal-reference corrections propagate to every linked day and remain reusable", async () => {
  await withStore(async (store) => {
    const initial = {
      basisGrams: 100,
      calories: { min: 120, max: 150 },
      protein: { min: 3, max: 5 },
      carbs: { min: 12, max: 18 },
      fat: { min: 5, max: 8 },
      evidence: "Datos iniciales",
    };
    const reference = customFood("Trinxat", initial);
    const originals = await store.addMany(
      [
        customFoodEntry(reference, "Trinxat", 100, "Comida", "2026-10-01T12:00:00Z"),
        customFoodEntry(reference, "Trinxat", 200, "Comida", "2026-10-02T12:00:00Z"),
      ],
      [reference],
    );
    const text =
      "Corrige la referencia de trinxat por 100 g: 100 kcal, proteínas 4 g, carbohidratos 15 g, grasas 3 g";
    const values = {
      basisGrams: 100,
      calories: { min: 100, max: 100 },
      protein: { min: 4, max: 4 },
      carbs: { min: 15, max: 15 },
      fat: { min: 3, max: 3 },
      evidence: text,
    };
    const reply = await respondToChat(text, store, {
      complete: completeFor([
        {
          ...item(null, "Trinxat"),
          saveOnly: true,
          customFoodId: reference.id,
          customNutrition: values,
        },
      ]),
    });
    assert.equal(reply.entriesUpdated!.length, 2);
    assert.equal(reply.entriesAdded.length, 0);
    const state = await store.read();
    assert.equal(state.customFoods.length, 1);
    assert.equal(state.customFoods[0].id, reference.id);
    assert.deepEqual(
      state.entries.map((entry) => entry.calories),
      [100, 200],
    );
    assert.deepEqual(
      state.entries.map((entry) => entry.id),
      originals.map((entry) => entry.id),
    );
    assert.deepEqual(
      (await store.foodHistory()).map((day) => day.total.calories),
      [200, 100],
    );
  });
});

test("invalid or deleted correction targets never partially update or resurrect a meal", async () => {
  await withStore(async (store) => {
    const original = await store.add(
      foodEntry(oil, "Atún", 120, "Comida", "2026-10-02T12:00:00Z"),
    );
    const wrong = await respondToChat("Corrige estos alimentos", store, {
      complete: completeFor([
        { ...item(original.id, "Atún", 100), keepSource: true },
        item(randomUUID(), "Otra comida"),
      ]),
    });
    assert.equal(wrong.entriesUpdated, undefined);
    assert.deepEqual((await store.read()).entries, [original]);
    const concurrent: JsonCompletion = async (name, schema) => {
      if (name === "meal_interpretation" || name === "meal_correction") {
        return schema.parse({
          action: "correct",
          clarification: null,
          foods: [item(original.id, "Atún en lata al natural")],
        });
      }
      await store.remove(original.id);
      return schema.parse({
        clarification: null,
        matches: [{ index: 0, fdcId: water.fdcId, portionIndex: null }],
      });
    };
    const reply = await respondToChat("El atún era al natural", store, {
      complete: concurrent,
    });
    assert.match(reply.message, /ya no existe/);
    assert.equal((await store.read()).entries.length, 0);
  });
});

test("read-only model replies cannot falsely confirm an update", async () => {
  await withStore(async (store) => {
    const complete: JsonCompletion = async (_name, schema) =>
      schema.parse({
        action: "answer",
        clarification: "El atún no tiene grasa. He actualizado los valores.",
        foods: [],
      });
    const reply = await respondToChat("Era de lata", store, { complete });
    assert.match(reply.message, /No he aplicado cambios/);
    assert.equal(reply.dataChanged, undefined);
    assert.equal((await store.read()).entries.length, 0);
  });
});

test("water or oil-free tuna requests cannot choose a canned-in-oil reference", async () => {
  await withStore(async (store) => {
    const original = await store.add(
      foodEntry(oil, "Atún", 120, "Comida", "2026-10-02T12:00:00Z"),
    );
    const reply = await respondToChat("Era sin aceite", store, {
      complete: completeFor([item(original.id, "Atún en lata sin aceites")], oil.fdcId),
    });
    assert.equal(reply.entriesUpdated, undefined);
    assert.deepEqual((await store.read()).entries, [original]);
  });
});

test("short or passive answers cannot claim unapplied corrections", async () => {
  await withStore(async (store) => {
    for (const message of [
      "Listo, corregido.",
      "Actualizado.",
      "Ya está cambiado.",
      "Se ha corregido el atún.",
      "Queda actualizado.",
    ]) {
      const complete: JsonCompletion = async (_name, schema) =>
        schema.parse({ action: "answer", clarification: message, foods: [] });
      const reply = await respondToChat("Corrígelo", store, { complete });
      assert.match(reply.message, /No he aplicado cambios/);
    }
  });
});

test("a source correction ignores fabricated zero patches when no nutrient numbers were supplied", async () => {
  await withStore(async (store) => {
    const original = await store.add(
      foodEntry(oil, "Atún", 120, "Comida", "2026-10-02T12:00:00Z"),
    );
    const food = {
      ...item(original.id, "Atún en lata al natural"),
      keepSource: false,
      nutrientPatch: {
        basis: "100g",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        evidence: "Inferred from no oil",
      },
    };
    const reply = await respondToChat("El atún era de lata al natural", store, {
      complete: completeFor([food]),
    });
    assert.equal(reply.entriesUpdated![0].calories, 103);
    assert.equal(reply.entriesUpdated![0].fat, 1.2);
  });
});
