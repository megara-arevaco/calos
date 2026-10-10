import {
  nutritionPlanSchema,
  planFromSnapshot,
  type NutritionPlan,
} from "./plan-schema.js";
import { customFoodEntry } from "./custom-food.js";
import { scaleRecipeEntry } from "./recipes.js";
import { NutritionConflictError } from "./errors.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { isCalendarDate, localTimestamp } from "../shared/calendar.js";
import {
  readJson,
  withFileLock,
  writeJsonAtomically,
  writeJsonAtomicallyExclusive,
} from "../shared/persistence.js";
import { nutritionSnapshotSchema } from "./snapshot-schema.js";
import type {
  CustomFood,
  DaySummary,
  FoodEntry,
  FoodHistoryDay,
  FoodTemplate,
  NutritionSource,
  Macros,
  NutritionProfile,
  NutritionSnapshot,
  NutritionImportResult,
  NutritionRetention,
  NutritionUndoOperation,
  NutritionUndoReceipt,
  WaistMeasurement,
  WeightMeasurement,
} from "./types.js";

const empty = (): NutritionSnapshot => ({
  version: 1,
  entries: [],
  deletedEntries: [],
  templates: [],
  undoOperations: [],
  retention: { trashDays: null, backupsDays: null },
  customFoods: [],
  waistMeasurements: [],
  weightMeasurements: [],
  profile: null,
  dailyGoal: { calories: 2200, protein: 140, carbs: 250, fat: 70 },
});

const sameDay = (date: string, iso: string) => iso.slice(0, 10) === date;
const sum = (a: number, b: number) => Math.round((a + b) * 10) / 10;

const stableValue = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, stableValue(child)]),
        )
      : value;

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));

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
  private recordUndo(
    state: NutritionSnapshot,
    operation: Omit<NutritionUndoOperation, "id" | "createdAt">,
  ): string {
    const id = randomUUID();
    state.undoOperations = [
      ...(state.undoOperations ?? []),
      { ...operation, id, createdAt: new Date().toISOString() },
    ].slice(-50);
    return id;
  }
  async read(): Promise<NutritionSnapshot> {
    const data = await readJson(this.filePath, empty());
    return data.version === 1 && Array.isArray(data.entries)
      ? {
          ...data,
          customFoods: Array.isArray(data.customFoods) ? data.customFoods : [],
          deletedEntries: Array.isArray(data.deletedEntries) ? data.deletedEntries : [],
          templates: Array.isArray(data.templates)
            ? data.templates.map((template) => ({
                ...template,
                baseServings: template.baseServings ?? 1,
              }))
            : [],
          undoOperations: Array.isArray(data.undoOperations) ? data.undoOperations : [],
          retention: data.retention ?? { trashDays: null, backupsDays: null },
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
    return (await this.addManyWithUndo(inputs, customFoods)).entries;
  }
  async addManyWithUndo(
    inputs: Omit<FoodEntry, "id" | "createdAt">[],
    customFoods: CustomFood[] = [],
  ): Promise<{ entries: FoodEntry[]; undoId?: string }> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const referenceIds = new Set(customFoods.map((food) => food.id));
      const beforeReferences = state.customFoods.filter((food) =>
        referenceIds.has(food.id),
      );
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

      const afterReferences = state.customFoods.filter((food) =>
        referenceIds.has(food.id),
      );
      const undoId =
        entries.length || !sameValue(beforeReferences, afterReferences)
          ? this.recordUndo(state, {
              before: [],
              after: entries,
              beforeReferences,
              afterReferences,
            })
          : undefined;
      await writeJsonAtomically(this.filePath, state);
      return { entries, undoId };
    });
  }
  async correctFoods(
    updates: { before: FoodEntry; after: Omit<FoodEntry, "id" | "createdAt"> }[],
    references: CustomFood[] = [],
    expectedReferences: CustomFood[] = [],
  ): Promise<FoodEntry[]> {
    return (await this.correctFoodsWithUndo(updates, references, expectedReferences))
      .entries;
  }
  async correctFoodsWithUndo(
    updates: { before: FoodEntry; after: Omit<FoodEntry, "id" | "createdAt"> }[],
    references: CustomFood[] = [],
    expectedReferences: CustomFood[] = [],
  ): Promise<{ entries: FoodEntry[]; undoId?: string }> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const ids = new Set<string>();

      for (const { before } of updates) {
        const current = state.entries.find((entry) => entry.id === before.id);

        if (!current || ids.has(before.id) || !sameValue(current, before)) {
          throw new NutritionConflictError(
            "El registro ha cambiado o ya no existe. Vuelve a pedir la corrección; no he aplicado cambios.",
          );
        }
        ids.add(before.id);
      }
      for (const reference of references) {
        const current = state.customFoods.find((food) => food.id === reference.id);
        const expected = expectedReferences.find((food) => food.id === reference.id);

        if (!sameValue(current, expected)) {
          throw new NutritionConflictError(
            "La referencia personal ha cambiado. Vuelve a pedir la corrección; no he aplicado cambios.",
          );
        }
      }

      const beforeEntries = state.entries.filter((entry) => {
        const source = entry.source;
        return (
          ids.has(entry.id) ||
          (source?.provider === "Datos del usuario" &&
            references.some((food) => food.id === source.customFoodId))
        );
      });
      const beforeReferences = references
        .map((reference) => state.customFoods.find((food) => food.id === reference.id))
        .filter((food): food is CustomFood => Boolean(food));

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

      const afterEntries = state.entries.filter((entry) => ids.has(entry.id));
      const afterReferences = references.map(
        (reference) => state.customFoods.find((food) => food.id === reference.id)!,
      );
      const undoId = this.recordUndo(state, {
        before: beforeEntries,
        after: afterEntries,
        beforeReferences,
        afterReferences,
      });
      await writeJsonAtomically(this.filePath, state);
      return { entries: afterEntries, undoId };
    });
  }
  async add(input: Omit<FoodEntry, "id" | "createdAt">): Promise<FoodEntry> {
    return (await this.addMany([input]))[0];
  }
  async saveManualEntry(input: {
    entryId?: string;
    expected?: FoodEntry;
    name: string;
    quantity: string;
    meal: FoodEntry["meal"];
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    provider: "Etiqueta nutricional" | "Datos del usuario";
    evidence: string;
  }): Promise<FoodEntry> {
    if (!isCalendarDate(input.date)) {
      throw new Error("La fecha del registro no es válida");
    }

    const macros = {
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    };
    const entry = await withFileLock(this.filePath, async () => {
      const state = await this.read();
      const existing = input.entryId
        ? state.entries.find((item) => item.id === input.entryId)
        : undefined;

      if (
        input.entryId &&
        (!existing || !input.expected || !sameValue(existing, input.expected))
      ) {
        throw new NutritionConflictError(
          "El registro ha cambiado o ya no existe. Actualiza el diario antes de guardar la edición.",
        );
      }
      if (!input.entryId && input.expected) {
        throw new Error("No se puede editar un registro sin identificador");
      }

      const source: NutritionSource =
        input.provider === "Etiqueta nutricional"
          ? {
              provider: input.provider,
              basis: "serving",
              perBasis: macros,
              amount: 1,
              unit: "ración",
              evidence: input.evidence,
            }
          : {
              provider: input.provider,
              basis: "serving",
              perBasis: macros,
              ranges: {
                calories: { min: macros.calories, max: macros.calories },
                protein: { min: macros.protein, max: macros.protein },
                carbs: { min: macros.carbs, max: macros.carbs },
                fat: { min: macros.fat, max: macros.fat },
              },
              amountRanges: {
                calories: { min: macros.calories, max: macros.calories },
                protein: { min: macros.protein, max: macros.protein },
                carbs: { min: macros.carbs, max: macros.carbs },
                fat: { min: macros.fat, max: macros.fat },
              },
              amount: 1,
              unit: "ración",
              evidence: input.evidence,
            };
      const saved: FoodEntry = {
        ...macros,
        id: existing?.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        name: input.name.trim(),
        quantity: input.quantity.trim(),
        meal: input.meal,
        eatenAt: localTimestamp(new Date(`${input.date}T12:00:00`)),
        source,
      };
      state.entries = existing
        ? state.entries.map((item) => (item.id === existing.id ? saved : item))
        : [...state.entries, saved];
      this.recordUndo(state, {
        before: existing ? [existing] : [],
        after: [saved],
        beforeReferences: [],
        afterReferences: [],
      });
      await writeJsonAtomically(this.filePath, state);
      return saved;
    });
    return entry;
  }
  async repeatEntry(id: string, date: string): Promise<FoodEntry> {
    if (!isCalendarDate(date)) {
      throw new Error("La fecha del registro no es válida");
    }

    const source = (await this.read()).entries.find((entry) => entry.id === id);

    if (!source) {
      throw new Error("El registro que quieres repetir ya no existe");
    }

    const { id: _id, createdAt: _createdAt, ...content } = source;
    const [entry] = await this.addMany([
      { ...content, eatenAt: localTimestamp(new Date(`${date}T12:00:00`)) },
    ]);
    return entry;
  }
  async templates(): Promise<FoodTemplate[]> {
    return [...((await this.read()).templates ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
  async saveTemplate(
    name: string,
    entryIds: string[],
    baseServings = 1,
  ): Promise<FoodTemplate> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const ids = new Set(entryIds);

      if (ids.size !== entryIds.length) {
        throw new Error("La comida contiene registros duplicados");
      }

      const entries = state.entries.filter((entry) => ids.has(entry.id));

      if (!entries.length || entries.length !== ids.size) {
        throw new Error("No se han encontrado todos los registros de la comida");
      }
      if ((state.templates ?? []).length >= 500) {
        throw new Error("Se ha alcanzado el límite de favoritos");
      }

      const template: FoodTemplate = {
        id: randomUUID(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        baseServings,
        entries: entries.map(({ id: _id, createdAt: _createdAt, ...entry }) => entry),
      };
      state.templates = [...(state.templates ?? []), template];
      await writeJsonAtomically(this.filePath, state);
      return template;
    });
  }
  async updateTemplate(
    input: FoodTemplate,
    expected: FoodTemplate,
  ): Promise<FoodTemplate> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const current = state.templates?.find((item) => item.id === input.id);

      if (!current || !sameValue(current, expected)) {
        throw new NutritionConflictError(
          "La receta ha cambiado. Recárgala antes de guardar los cambios.",
        );
      }

      const updated: FoodTemplate = {
        ...input,
        name: input.name.trim(),
        entries: input.entries.map((entry) => ({ ...entry })),
      };
      state.templates = state.templates!.map((item) =>
        item.id === updated.id ? updated : item,
      );
      await writeJsonAtomically(this.filePath, state);
      return updated;
    });
  }
  async repeatTemplate(id: string, date: string, servings = 1): Promise<FoodEntry[]> {
    return (await this.repeatTemplateWithUndo(id, date, servings)).entries;
  }
  async repeatTemplateWithUndo(
    id: string,
    date: string,
    servings = 1,
  ): Promise<{ entries: FoodEntry[]; undoId?: string }> {
    if (!isCalendarDate(date)) {
      throw new Error("La fecha del registro no es válida");
    }
    if (!Number.isFinite(servings) || servings <= 0 || servings > 1000) {
      throw new Error("Las porciones deben estar entre 0 y 1000");
    }

    const template = (await this.read()).templates?.find((item) => item.id === id);

    if (!template) {
      throw new Error("La receta ya no existe");
    }

    const factor = servings / template.baseServings;
    const inputs = template.entries.map((entry) => {
      const scaled = scaleRecipeEntry(entry, factor);
      return {
        ...scaled,
        eatenAt: localTimestamp(new Date(`${date}T12:00:00`)),
      };
    });
    return this.addManyWithUndo(inputs);
  }
  async restore(id: string): Promise<FoodEntry> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const removed = (state.deletedEntries ?? []).find((entry) => entry.id === id);

      if (!removed) {
        throw new Error("El registro eliminado ya no está disponible");
      }

      const { deletedAt: _deletedAt, ...entry } = removed;
      state.deletedEntries = state.deletedEntries!.filter((item) => item.id !== id);
      state.entries = [...state.entries, entry];
      await writeJsonAtomically(this.filePath, state);
      return entry;
    });
  }
  async undoHistory(): Promise<NutritionUndoReceipt[]> {
    const state = await this.read();
    return (state.undoOperations ?? [])
      .filter((operation) => operation.after.length > 0)
      .slice(-10)
      .reverse()
      .map((operation) => ({
        id: operation.id,
        createdAt: operation.createdAt,
        entries: operation.after,
      }));
  }
  async undo(id: string): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const operation = state.undoOperations?.find((item) => item.id === id);

      if (!operation) {
        throw new NutritionConflictError(
          "Esta operación ya no se puede deshacer. Actualiza el diario y revisa los cambios posteriores.",
        );
      }

      const afterIds = new Set(operation.after.map((entry) => entry.id));
      const currentAfter = state.entries.filter((entry) => afterIds.has(entry.id));
      const referencesMatch = operation.afterReferences.every((expected) =>
        sameValue(
          state.customFoods.find((reference) => reference.id === expected.id),
          expected,
        ),
      );
      const beforeReferenceIds = new Set(
        operation.beforeReferences.map((reference) => reference.id),
      );
      const afterReferenceIds = new Set(
        operation.afterReferences.map((reference) => reference.id),
      );
      const linkedIds = new Set([...beforeReferenceIds, ...afterReferenceIds]);
      const currentLinked = state.entries.filter(
        (entry) =>
          entry.source?.provider === "Datos del usuario" &&
          linkedIds.has(entry.source.customFoodId ?? ""),
      );
      const expectedLinked = operation.after.filter(
        (entry) =>
          entry.source?.provider === "Datos del usuario" &&
          linkedIds.has(entry.source.customFoodId ?? ""),
      );

      if (
        currentAfter.length !== operation.after.length ||
        !operation.after.every((expected) =>
          sameValue(
            state.entries.find((entry) => entry.id === expected.id),
            expected,
          ),
        ) ||
        !referencesMatch ||
        !sameValue(currentLinked, expectedLinked)
      ) {
        throw new NutritionConflictError(
          "No se ha deshecho nada: una o más entradas o referencias cambiaron después de esta operación. Actualiza el diario antes de continuar.",
        );
      }

      const afterReferenceIdSet = new Set(
        operation.afterReferences.map((reference) => reference.id),
      );
      state.entries = [
        ...state.entries.filter((entry) => !afterIds.has(entry.id)),
        ...operation.before,
      ];
      state.customFoods = [
        ...state.customFoods.filter(
          (reference) => !afterReferenceIdSet.has(reference.id),
        ),
        ...operation.beforeReferences,
      ];
      state.undoOperations = state.undoOperations!.filter((item) => item.id !== id);
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async deletedEntries() {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const kept = this.applyTrashRetention(state);

      if (!sameValue(kept, state.deletedEntries)) {
        state.deletedEntries = kept;
        await writeJsonAtomically(this.filePath, state);
      }
      return [...kept].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    });
  }
  private applyTrashRetention(state: NutritionSnapshot) {
    const days = state.retention?.trashDays ?? null;

    if (days === null) {
      return state.deletedEntries ?? [];
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return (state.deletedEntries ?? []).filter(
      (entry) => Date.parse(entry.deletedAt) >= cutoff,
    );
  }
  async deleteTrashEntry(id: string): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      const items = state.deletedEntries ?? [];

      if (!items.some((entry) => entry.id === id)) {
        throw new Error("El registro ya no está en la papelera");
      }
      state.deletedEntries = items.filter((entry) => entry.id !== id);
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async retentionSettings(): Promise<NutritionRetention> {
    const retention = (await this.read()).retention;
    return retention ?? { trashDays: null, backupsDays: null };
  }
  async saveRetentionSettings(input: NutritionRetention): Promise<NutritionRetention> {
    return withFileLock(this.filePath, async () => {
      const state = await this.read();
      state.retention = input;
      state.deletedEntries = this.applyTrashRetention(state);
      await writeJsonAtomically(this.filePath, state);
      return input;
    });
  }
  private backupDirectory() {
    return join(dirname(this.filePath), "backups");
  }
  private backupFile(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Identificador de respaldo no válido");
    }
    return join(this.backupDirectory(), `nutrition-${id}.json`);
  }
  private async createBackup(state: NutritionSnapshot) {
    const id = randomUUID();
    const backupPath = `backups/nutrition-${id}.json`;
    await writeJsonAtomicallyExclusive(this.backupFile(id), state);
    return { id, backupPath };
  }
  async backups() {
    const retention = await this.retentionSettings();
    const directory = this.backupDirectory();
    const names = await fs.readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    });
    const output: { id: string; createdAt: string; size: number }[] = [];
    const cutoff =
      retention.backupsDays === null
        ? null
        : Date.now() - retention.backupsDays * 24 * 60 * 60 * 1000;

    for (const name of names) {
      const match = /^nutrition-([0-9a-f-]{36})\.json$/i.exec(name);

      if (!match) {
        continue;
      }

      const id = match[1]!;
      const path = this.backupFile(id);
      const info = await fs.stat(path).catch(() => null);

      if (!info?.isFile()) {
        continue;
      }
      if (cutoff !== null && info.mtimeMs < cutoff) {
        await fs.rm(path, { force: true });
        continue;
      }
      try {
        nutritionSnapshotSchema.parse(await readJson(path, null));
      } catch {
        continue;
      }
      output.push({ id, createdAt: info.mtime.toISOString(), size: info.size });
    }
    return output.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async downloadBackup(id: string) {
    const snapshot = nutritionSnapshotSchema.parse(
      await readJson(this.backupFile(id), null),
    );
    return { id, snapshot };
  }
  async deleteBackup(id: string): Promise<void> {
    const path = this.backupFile(id);
    const info = await fs.stat(path).catch(() => null);

    if (!info?.isFile()) {
      throw new Error("El respaldo no existe");
    }
    await fs.rm(path);
  }
  async restoreBackup(id: string): Promise<NutritionImportResult> {
    const sourcePath = this.backupFile(id);
    const restored = nutritionSnapshotSchema.parse(await readJson(sourcePath, null));
    return withFileLock(this.filePath, async () => {
      const previous = await this.read();
      let backup: { id: string; backupPath: string };

      try {
        backup = await this.createBackup(previous);
      } catch {
        throw new Error(
          "No se ha podido crear la copia previa; no se ha restaurado el perfil.",
        );
      }
      await writeJsonAtomically(this.filePath, {
        ...restored,
        retention: previous.retention ?? { trashDays: null, backupsDays: null },
        undoOperations: [],
      });
      return {
        backupId: backup.id,
        backupPath: backup.backupPath,
        recoveryInstructions:
          "Se creó una copia del estado anterior antes de restaurar este respaldo.",
      };
    });
  }
  async importSnapshot(input: unknown): Promise<NutritionImportResult> {
    const parsed = nutritionSnapshotSchema.parse(input);
    return withFileLock(this.filePath, async () => {
      const previous = await this.read();
      let backup: { id: string; backupPath: string };

      try {
        backup = await this.createBackup(previous);
      } catch {
        throw new Error(
          "No se ha podido crear el respaldo previo; no se ha modificado el perfil.",
        );
      }
      await writeJsonAtomically(this.filePath, {
        ...parsed,
        deletedEntries: parsed.deletedEntries ?? [],
        templates: parsed.templates ?? [],
        undoOperations: [],
        retention: previous.retention ?? { trashDays: null, backupsDays: null },
      });
      return {
        backupId: backup.id,
        backupPath: backup.backupPath,
        recoveryInstructions: `Descarga el respaldo con el identificador ${backup.id} desde la gestión de respaldos de este perfil.`,
      };
    });
  }
  async remove(id: string): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const state = await this.read();
      const removed = state.entries.find((entry) => entry.id === id);

      if (!removed) {
        return;
      }
      state.entries = state.entries.filter((entry) => entry.id !== id);
      state.deletedEntries = [
        ...(state.deletedEntries ?? []),
        { ...removed, deletedAt: new Date().toISOString() },
      ];
      await writeJsonAtomically(this.filePath, state);
    });
  }
  async exportSnapshot(): Promise<NutritionSnapshot> {
    const { undoOperations: _undoOperations, ...snapshot } = await this.read();
    return nutritionSnapshotSchema.parse(snapshot);
  }
}
