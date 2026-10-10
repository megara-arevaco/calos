import { catalogue, foodEntry } from "../catalogue.js";
import { labelEntry } from "../label.js";
import { AssistantError } from "../openrouter.js";
import type { FoodEntry, NutritionSnapshot } from "../types.js";
import type { ParsedFood } from "./schemas.js";

export function correctionTargets(
  foods: ParsedFood[],
  state: NutritionSnapshot,
): Map<string, FoodEntry> {
  const targets = new Map<string, FoodEntry>();

  for (const item of foods) {
    if (item.saveOnly && item.customNutrition && item.customFoodId && !item.entryId) {
      if (!state.customFoods.some((food) => food.id === item.customFoodId)) {
        throw new AssistantError(
          "La referencia personal ya no existe. No he aplicado cambios.",
        );
      }
      continue;
    }

    const existing = state.entries.find((entry) => entry.id === item.entryId);

    if (!existing || targets.has(existing.id)) {
      throw new AssistantError(
        "No he identificado un único registro para cada corrección. Indica qué comida quieres corregir; no he aplicado cambios.",
      );
    }
    if (item.saveOnly) {
      throw new AssistantError(
        "Indica si quieres corregir este consumo o la referencia personal. No he aplicado cambios.",
      );
    }
    targets.set(existing.id, existing);
    if (item.meal === null) {
      item.meal = existing.meal;
    }
    if (
      item.grams === null &&
      item.milliliters === null &&
      item.portionCount === null
    ) {
      const source = existing.source;

      if (source?.volumeEstimate) {
        item.milliliters = source.volumeEstimate.milliliters;
      } else if (source?.provider === "USDA FoodData Central") {
        item.grams = source.grams;
      } else if (source?.unit === "g") {
        item.grams = source.amount;
      } else if (source?.unit === "ml") {
        item.milliliters = source.amount;
      } else if (source?.unit === "ración") {
        item.portionCount = source.amount;
        item.portionDescription = "serving";
      } else {
        throw new AssistantError(
          "Indica la cantidad del registro que quieres corregir. No he aplicado cambios.",
        );
      }
    }
  }
  return targets;
}

export function rescaleEntry(
  existing: FoodEntry,
  item: ParsedFood,
): Omit<FoodEntry, "id" | "createdAt"> {
  const source = existing.source;

  if (!source) {
    throw new AssistantError(
      "Este registro no conserva su referencia nutricional. Indica los valores o el alimento completo para corregirlo.",
    );
  }

  const eatenAt = item.eatenDate
    ? item.eatenDate + existing.eatenAt.slice(10)
    : existing.eatenAt;

  if (source.provider === "USDA FoodData Central") {
    const reference = catalogue.find((food) => food.fdcId === source.fdcId);

    if (!reference || item.grams === null) {
      throw new AssistantError(
        "Indica la cantidad corregida en gramos; no he aplicado cambios.",
      );
    }

    const scaled = foodEntry(
      reference,
      item.name,
      item.grams,
      item.meal ?? existing.meal,
      eatenAt,
    );
    return {
      ...scaled,
      source: scaled.source
        ? {
            ...scaled.source,
            ...(source.photoEstimate ? { photoEstimate: source.photoEstimate } : {}),
          }
        : undefined,
    };
  }

  const entry = labelEntry(
    {
      basis: source.basis,
      servingGrams: null,
      ...source.perBasis,
      kilojoules: null,
      evidence: source.evidence,
    },
    item,
    item.meal ?? existing.meal,
    eatenAt,
  );

  if (entry.source?.provider !== "Etiqueta nutricional") {
    throw new Error("Invalid scaled source");
  }

  const nextSource = { ...source };
  delete nextSource.volumeEstimate;
  return {
    ...entry,
    source: {
      ...nextSource,
      amount: entry.source.amount,
      unit: entry.source.unit,
    } as FoodEntry["source"],
  };
}

export function correctionDate(existing: FoodEntry, item: ParsedFood) {
  return item.eatenDate
    ? item.eatenDate + existing.eatenAt.slice(10)
    : existing.eatenAt;
}

export function applyNutrientPatch(
  entry: Omit<FoodEntry, "id" | "createdAt">,
  item: ParsedFood,
  text: string,
  original?: FoodEntry,
): Omit<FoodEntry, "id" | "createdAt"> {
  const patch = item.nutrientPatch;

  if (!patch) {
    return entry;
  }

  const changedReference =
    entry.source?.provider === "USDA FoodData Central" &&
    original?.source?.provider === "USDA FoodData Central" &&
    entry.source.fdcId !== original.source.fdcId;
  const nutrientNumbers =
    /(?:\b(?:\d+(?:[.,]\d+)?|cero)\s*(?:g|gr|gramos|kcal)?\s*(?:de\s+)?(?:grasas?|prote[ií]nas?|carbohidratos?|hidratos?|calor[ií]as?)\b|\b(?:grasas?|prote[ií]nas?|carbohidratos?|hidratos?|calor[ií]as?)\s*(?::|=|a|de)?\s*(?:\d+|cero)\b)/i.test(
      text,
    );
  // A source correction is not permission to invent nutrient overrides. Some
  // providers fill a nullable patch with zeros even when no numbers were supplied.
  const changedAmountOrMetadata =
    original &&
    (entry.quantity !== original.quantity ||
      entry.eatenAt !== original.eatenAt ||
      entry.meal !== original.meal ||
      entry.name !== original.name);

  if ((changedReference || changedAmountOrMetadata) && !nutrientNumbers) {
    return entry;
  }
  if (!item.entryId || !text.includes(patch.evidence)) {
    throw new AssistantError(
      "Solo puedo corregir nutrientes de un registro existente con valores explícitos de tu mensaje. No he aplicado cambios.",
    );
  }

  const keys = ["calories", "protein", "carbs", "fat"] as const;
  const numbers = (patch.evidence.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) =>
    Number(value.replace(",", ".")),
  );

  if (
    keys.every((key) => patch[key] === null) ||
    keys.some(
      (key) =>
        patch[key] !== null &&
        !numbers.includes(patch[key]!) &&
        !(patch[key] === 0 && /\bcero\b/i.test(patch.evidence)),
    )
  ) {
    throw new AssistantError(
      "Escribe los valores concretos que quieres corregir y si son por 100 g, 100 ml, ración o por el consumo. No he aplicado cambios.",
    );
  }

  const source = entry.source;

  if (!source) {
    throw new AssistantError(
      "El registro no tiene una referencia utilizable. Indica los valores completos; no he aplicado cambios.",
    );
  }

  const perBasis =
    source.provider === "USDA FoodData Central"
      ? catalogue.find((food) => food.fdcId === source.fdcId)?.per100g
      : source.perBasis;

  if (!perBasis) {
    throw new Error("Unknown source for patch");
  }

  const basis = source.provider === "USDA FoodData Central" ? "100g" : source.basis;
  const unit = source.provider === "USDA FoodData Central" ? "g" : source.unit;
  const amount =
    source.provider === "USDA FoodData Central" ? source.grams : source.amount;
  const factor = amount / (basis === "serving" ? 1 : 100);

  if (patch.basis !== "entry" && patch.basis !== basis) {
    throw new AssistantError(
      "La unidad de la corrección no coincide con la referencia. No puedo asumir una densidad; no he aplicado cambios.",
    );
  }

  const values = { ...perBasis };
  const ranges =
    source.provider === "Datos del usuario"
      ? structuredClone(source.ranges)
      : {
          calories: { min: values.calories, max: values.calories },
          protein: { min: values.protein, max: values.protein },
          carbs: { min: values.carbs, max: values.carbs },
          fat: { min: values.fat, max: values.fat },
        };

  for (const key of keys) {
    if (patch[key] !== null) {
      values[key] = patch[key]! / (patch.basis === "entry" ? factor : 1);
      ranges[key] = { min: values[key], max: values[key] };
    }
  }

  const corrected = labelEntry(
    {
      basis,
      servingGrams: null,
      ...values,
      kilojoules: null,
      evidence: patch.evidence,
    },
    {
      name: item.name,
      grams: unit === "g" ? amount : null,
      milliliters: unit === "ml" ? amount : null,
      portionCount: unit === "ración" ? amount : null,
      portionDescription: unit === "ración" ? "serving" : null,
    },
    entry.meal,
    entry.eatenAt,
  );
  const amountRanges = {} as typeof ranges;

  for (const key of keys) {
    amountRanges[key] = {
      min: Math.round(ranges[key].min * factor * 10) / 10,
      max: Math.round(ranges[key].max * factor * 10) / 10,
    };
  }
  return {
    ...corrected,
    source:
      source.provider === "Estimación" && keys.some((key) => patch[key] === null)
        ? {
            ...source,
            perBasis: values,
            evidence: `Corrección explícita del usuario: ${patch.evidence}. Los nutrientes restantes siguen siendo estimados.`,
          }
        : {
            provider: "Datos del usuario",
            basis,
            perBasis: values,
            ranges,
            amountRanges,
            amount,
            unit,
            evidence: `Corrección explícita del usuario: ${patch.evidence}. Fuente previa: ${source.provider}.`,
            ...(source.photoEstimate ? { photoEstimate: source.photoEstimate } : {}),
          },
  };
}
