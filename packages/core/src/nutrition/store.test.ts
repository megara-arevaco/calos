import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { NutritionStore } from "./store.js";

test("waist history persists, sorts by measurement date, updates and deletes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-waist-"));
  const file = join(directory, "nutrition.json");

  try {
    const store = new NutritionStore(file);
    assert.deepEqual(await store.waistHistory(), []);
    const original = await store.saveWaist({ date: "2026-10-02", centimeters: 82.5 });
    await store.saveWaist({ date: "2026-09-25", centimeters: 84 });
    const updated = await store.saveWaist({ date: "2026-10-02", centimeters: 82.1 });
    assert.equal(updated.id, original.id);
    assert.equal(updated.createdAt, original.createdAt);
    const reopened = new NutritionStore(file);
    const history = await reopened.waistHistory();
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map(({ date, centimeters }) => ({ date, centimeters })),
      [
        { date: "2026-10-02", centimeters: 82.1 },
        { date: "2026-09-25", centimeters: 84 },
      ],
    );
    await reopened.removeWaist(updated.id);
    assert.deepEqual(
      (await store.waistHistory()).map((item) => item.date),
      ["2026-09-25"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy nutrition data survives migration and concurrent saves", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-waist-"));
  const file = join(directory, "nutrition.json");

  try {
    const legacy = {
      version: 1,
      entries: [{ id: "existing-food" }],
      dailyGoal: { calories: 1800, protein: 100, carbs: 200, fat: 60 },
    };
    await writeFile(file, JSON.stringify(legacy));
    const store = new NutritionStore(file);
    assert.deepEqual(await store.waistHistory(), []);
    await Promise.all([
      store.saveWaist({ date: "2026-10-01", centimeters: 83 }),
      store.saveWaist({ date: "2026-10-02", centimeters: 82.5 }),
    ]);
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(saved.entries, legacy.entries);
    assert.deepEqual(saved.dailyGoal, legacy.dailyGoal);
    assert.equal(saved.waistMeasurements.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid waist measurements cannot be persisted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-waist-"));

  try {
    const store = new NutritionStore(join(directory, "nutrition.json"));

    for (const centimeters of [0, -1, 0.01, 301, NaN, Infinity]) {
      await assert.rejects(store.saveWaist({ date: "2026-10-02", centimeters }));
    }
    for (const date of ["invalid", "2026-02-30", "2026-13-01"]) {
      await assert.rejects(store.saveWaist({ date, centimeters: 82 }));
    }
    assert.deepEqual(await store.waistHistory(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("food history groups dates, totals meals and reflects deletions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-food-history-"));

  try {
    const store = new NutritionStore(join(directory, "nutrition.json"));
    const food = {
      name: "Arroz",
      quantity: "100 g",
      meal: "Comida" as const,
      calories: 130,
      protein: 2.7,
      carbs: 28.2,
      fat: 0.3,
    };
    const added = await store.addMany([
      { ...food, eatenAt: "2026-09-30T12:00:00Z" },
      { ...food, eatenAt: "2026-10-01T12:00:00Z" },
      { ...food, eatenAt: "2026-10-01T18:00:00Z" },
    ]);
    const history = await store.foodHistory();
    assert.deepEqual(
      history.map(({ date, entryCount }) => ({ date, entryCount })),
      [
        { date: "2026-10-01", entryCount: 2 },
        { date: "2026-09-30", entryCount: 1 },
      ],
    );
    assert.equal(history[0].total.calories, 260);
    assert.equal(history[0].total.protein, 5.4);
    assert.equal((await store.summary("2026-09-30")).entries.length, 1);
    await store.remove(added[0].id);
    assert.equal((await store.foodHistory()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("weight history persists, updates dates and preserves legacy profile, foods and waist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calos-weight-"));
  const file = join(directory, "nutrition.json");

  try {
    const legacy = {
      version: 1,
      entries: [{ id: "food" }],
      dailyGoal: { calories: 2400, protein: 140, carbs: 250, fat: 70 },
      waistMeasurements: [{ id: "waist", date: "2026-09-30", centimeters: 90 }],
      profile: {
        heightCm: 183,
        weightKg: 99,
        goal: "Pérdida de grasa y ganancia de músculo",
      },
    };
    await writeFile(file, JSON.stringify(legacy));
    const store = new NutritionStore(file);
    assert.deepEqual(await store.weightHistory(), []);
    const first = await store.saveWeight({ date: "2026-10-01", kilograms: 99 });
    await store.saveWeight({ date: "2026-09-25", kilograms: 100 });
    const updated = await store.saveWeight({ date: "2026-10-01", kilograms: 98.7 });
    assert.equal(updated.id, first.id);
    const reopened = new NutritionStore(file);
    assert.deepEqual(
      (await reopened.weightHistory()).map((item) => item.kilograms),
      [98.7, 100],
    );
    const state = await reopened.read();
    assert.deepEqual(state.profile, legacy.profile);
    assert.deepEqual(state.entries, legacy.entries);
    assert.deepEqual(state.waistMeasurements, legacy.waistMeasurements);
    assert.equal(state.dailyGoal.calories, 2400);
    for (const kilograms of [0, -1, NaN, Infinity, 501]) {
      await assert.rejects(store.saveWeight({ date: "2026-10-02", kilograms }));
    }
    await assert.rejects(store.saveWeight({ date: "2026-02-30", kilograms: 99 }));
    await reopened.removeWeight(first.id);
    assert.deepEqual(
      (await store.weightHistory()).map((item) => item.kilograms),
      [100],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
