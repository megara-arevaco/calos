import {
  nutritionPlanSchema,
  planFromSnapshot,
  type NutritionPlan,
} from "./plan-schema.js";
import { customFoodEntry } from "./custom-food.js";
import { NutritionConflictError } from "./errors.js";
import { randomUUID } from "node:crypto";
import { readJson, withFileLock, writeJsonAtomically } from "../shared/persistence.js";
import type {
  CustomFood,
  DaySummary,
  FoodEntry,
  FoodHistoryDay,
  Macros,
  NutritionProfile,
  NutritionSnapshot,
  WaistMeasurement,
  WeightMeasurement,
} from "./types.js";

const empty = (): NutritionSnapshot => ({
  version: 1,
  entries: [],
  customFoods: [],
  waistMeasurements: [],
  weightMeasurements: [],
  profile: null,
  dailyGoal: { calories: 2200, protein: 140, carbs: 250, fat: 70 },
});

const sameDay = (date: string, iso: string) => iso.slice(0, 10) === date;
const sum = (a: number, b: number) => Math.round((a + b) * 10) / 10;

export const summarizeMacros = (items: Macros[]): Macros =>
  items.reduce(
    (a, x) => ({
      calories: sum(a.calories, x.calories),
      protein: sum(a.protein, x.protein),
      carbs: sum(a.carbs, x.carbs),
      fat: sum(a.fat, x.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

export class NutritionStore {
  constructor(private readonly filePath: string) {}
  async read(): Promise<NutritionSnapshot> {
    const data = await readJson(this.filePath, empty());
    return data.version === 1 && Array.isArray(data.entries)
      ? {
          ...data,
          customFoods: Array.isArray(data.customFoods) ? data.customFoods : [],
          profile: data.profile ?? null,
          weightMeasurements: Array.isArray(data.weightMeasurements)
            ? data.weightMeasurements
            : [],
          waistMeasurements: Array.isArray(data.waistMeasurements)
            ? data.waistMeasurements
            : [],
        }
      : empty();
  }
  async weightHistory(): Promise<WeightMeasurement[]> {
    return (await this.read()).weightMeasurements.sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }
  async saveWeight(
    input: Pick<WeightMeasurement, "date" | "kilograms">,
  ): Promise<WeightMeasurement> {
    const timestamp = Date.parse(`${input.date}T12:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== input.date ||
      !Number.isFinite(input.kilograms) ||
      input.kilograms < 0.1 ||
      input.kilograms > 500
    ) {
      throw new Error("Peso no válido");
    }
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const existing = state.weightMeasurements.find(
        (measurement) => measurement.date === input.date,
      );
      const measurement = {
        ...input,
        kilograms: Math.round(input.kilograms * 10) / 10,
        id: existing?.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      state.weightMeasurements = [
        ...state.weightMeasurements.filter((item) => item.date !== input.date),
        measurement,
      ];
      await writeJsonAtomically(this.filePath, state);
      return measurement;
    });
  }
  async removeWeight(id: string): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const state = await this.read();
      state.weightMeasurements = state.weightMeasurements.filter(
        (measurement) => measurement.id !== id,
      );
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async updateProfile(profile: NutritionProfile, dailyCalories: number): Promise<void> {
    if (
      !Number.isFinite(profile.heightCm) ||
      profile.heightCm <= 0 ||
      !Number.isFinite(profile.weightKg) ||
      profile.weightKg <= 0 ||
      !profile.goal.trim() ||
      !Number.isFinite(dailyCalories) ||
      dailyCalories <= 0
    ) {
      throw new Error("Perfil nutricional no válido");
    }
    await withFileLock(this.filePath, async () => {
      const state = await this.read();
      state.profile = { ...profile };
      state.dailyGoal.calories = dailyCalories;
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async nutritionPlan(): Promise<NutritionPlan> {
    return planFromSnapshot(await this.read());
  }
  async saveNutritionPlan(
    input: NutritionPlan,
    expected: NutritionPlan,
  ): Promise<NutritionPlan> {
    const plan = nutritionPlanSchema.parse(input);
    const previous = nutritionPlanSchema.parse(expected);
    return withFileLock(this.filePath, async () => {
      const state = await this.read();

      if (JSON.stringify(planFromSnapshot(state)) !== JSON.stringify(previous)) {
        throw new NutritionConflictError(
          "Tus objetivos han cambiado. Vuelve a revisarlos antes de aplicar la propuesta.",
        );
      }

      const { dailyGoal, ...objectives } = plan;
      state.objectives = objectives;
      state.dailyGoal = dailyGoal;
      if (state.profile) {
        state.profile.goal = objectives.goal;
      }
      await writeJsonAtomically(this.filePath, state);
      return planFromSnapshot(state);
    });
  }
  async waistHistory(): Promise<WaistMeasurement[]> {
    return (await this.read()).waistMeasurements.sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }
  async saveWaist(
    input: Pick<WaistMeasurement, "date" | "centimeters">,
  ): Promise<WaistMeasurement> {
    const timestamp = Date.parse(`${input.date}T12:00:00Z`);
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(input.date) &&
      Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === input.date;

    if (
      !validDate ||
      !Number.isFinite(input.centimeters) ||
      input.centimeters < 0.1 ||
      input.centimeters > 300
    ) {
      throw new Error("Medida de cintura no válida");
    }
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const existing = state.waistMeasurements.find(
        (measurement) => measurement.date === input.date,
      );
      const measurement = {
        ...input,
        centimeters: Math.round(input.centimeters * 10) / 10,
        id: existing?.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };

      if (measurement.centimeters <= 0) {
        throw new Error("Medida de cintura no válida");
      }
      state.waistMeasurements = [
        ...state.waistMeasurements.filter((item) => item.date !== input.date),
        measurement,
      ];
      await writeJsonAtomically(this.filePath, state);
      return measurement;
    });
  }
  async removeWaist(id: string): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const state = await this.read();
      state.waistMeasurements = state.waistMeasurements.filter(
        (measurement) => measurement.id !== id,
      );
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async summary(date: string): Promise<DaySummary> {
    const state = await this.read();
    const entries = state.entries.filter((entry) => sameDay(date, entry.eatenAt));
    return {
      date,
      entries,
      total: summarizeMacros(entries),
      dailyGoal: state.dailyGoal,
    };
  }
  async foodHistory(): Promise<FoodHistoryDay[]> {
    const days = new Map<string, FoodEntry[]>();

    for (const entry of (await this.read()).entries) {
      const date = entry.eatenAt.slice(0, 10);
      const entries = days.get(date) ?? [];
      entries.push(entry);
      days.set(date, entries);
    }
    return [...days]
      .map(([date, entries]) => ({
        date,
        total: summarizeMacros(entries),
        entryCount: entries.length,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  async addMany(
    inputs: Omit<FoodEntry, "id" | "createdAt">[],
    customFoods: CustomFood[] = [],
  ): Promise<FoodEntry[]> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const entries = inputs.map((input) => ({
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      }));
      state.entries.push(...entries);
      for (const food of customFoods) {
        state.customFoods = [
          ...state.customFoods.filter((item) => item.id !== food.id),
          food,
        ];
      }
      await writeJsonAtomically(this.filePath, state);
      return entries;
    });
  }
  async correctFoods(
    updates: { before: FoodEntry; after: Omit<FoodEntry, "id" | "createdAt"> }[],
    references: CustomFood[] = [],
    expectedReferences: CustomFood[] = [],
  ): Promise<FoodEntry[]> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const ids = new Set<string>();

      for (const { before } of updates) {
        const current = state.entries.find((entry) => entry.id === before.id);

        if (
          !current ||
          ids.has(before.id) ||
          JSON.stringify(current) !== JSON.stringify(before)
        ) {
          throw new NutritionConflictError(
            "El registro ha cambiado o ya no existe. Vuelve a pedir la corrección; no he aplicado cambios.",
          );
        }
        ids.add(before.id);
      }
      for (const reference of references) {
        const current = state.customFoods.find((food) => food.id === reference.id);
        const expected = expectedReferences.find((food) => food.id === reference.id);

        if (JSON.stringify(current) !== JSON.stringify(expected)) {
          throw new NutritionConflictError(
            "La referencia personal ha cambiado. Vuelve a pedir la corrección; no he aplicado cambios.",
          );
        }
      }
      // Correcting a personal reference updates every linked consumption in one write.
      for (const reference of references) {
        state.customFoods = [
          ...state.customFoods.filter((food) => food.id !== reference.id),
          reference,
        ];
        state.entries = state.entries.map((entry) => {
          if (
            entry.source?.provider !== "Datos del usuario" ||
            entry.source.customFoodId !== reference.id
          ) {
            return entry;
          }
          ids.add(entry.id);
          const recalculated = customFoodEntry(
            reference,
            entry.name,
            entry.source.amount,
            entry.meal,
            entry.eatenAt,
          );
          return {
            ...recalculated,
            ...(entry.source.volumeEstimate ? { quantity: entry.quantity } : {}),
            source: recalculated.source
              ? {
                  ...recalculated.source,
                  ...(entry.source.volumeEstimate
                    ? { volumeEstimate: entry.source.volumeEstimate }
                    : {}),
                  ...(entry.source.photoEstimate
                    ? { photoEstimate: entry.source.photoEstimate }
                    : {}),
                }
              : undefined,
            id: entry.id,
            createdAt: entry.createdAt,
          };
        });
      }
      for (const { before, after } of updates) {
        state.entries = state.entries.map((entry) =>
          entry.id === before.id
            ? { ...after, id: before.id, createdAt: before.createdAt }
            : entry,
        );
      }
      await writeJsonAtomically(this.filePath, state);
      return state.entries.filter((entry) => ids.has(entry.id));
    });
  }
  async add(input: Omit<FoodEntry, "id" | "createdAt">): Promise<FoodEntry> {
    return (await this.addMany([input]))[0];
  }
  async remove(id: string): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const state = await this.read();
      state.entries = state.entries.filter((entry) => entry.id !== id);
      await writeJsonAtomically(this.filePath, state);
    });
  }
}
