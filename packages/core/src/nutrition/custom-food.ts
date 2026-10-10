import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AssistantError } from "./openrouter.js";
import type { CustomFood, FoodEntry, MacroRanges, Macros } from "./types.js";

const range = z
  .object({
    min: z.number().finite().nonnegative().max(10000),
    max: z.number().finite().nonnegative().max(10000),
  })
  .strict();

export const customNutritionSchema = z
  .object({
    basisGrams: z.number().positive().max(10000),
    calories: range,
    protein: range,
    carbs: range,
    fat: range,
    evidence: z.string().min(1).max(1200),
  })
  .strict();

export type CustomNutrition = z.infer<typeof customNutritionSchema>;

export function hasWrittenNutrition(input: CustomNutrition, message = input.evidence) {
  const number = "(?:\\d+(?:[.,]\\d+)?|cero)";
  const range = `(${number})(?:\\s*(?:[-–—]|a)\\s*(${number}))?`;
  const text = input.evidence.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const labels = {
    calories: "(?:kcal|calorias?|calories|energia|energy)",
    protein: "(?:p|proteinas?|protein)",
    carbs: "(?:c|carbohidratos?|hidratos?(?: de carbono)?|carbs|carbohydrates)",
    fat: "(?:grasas?|fat|fats)",
  };
  const value = (raw: string) =>
    raw.toLowerCase() === "cero" ? 0 : Number(raw.replace(",", "."));
  const matches = (
    label: string,
    expected: { min: number; max: number },
    flags = "gi",
  ) => {
    const expressions = [
      new RegExp(`\\b${label}\\s*(?::|=|de)?\\s*${range}`, flags),
      new RegExp(`${range}\\s*(?:g|gr|gramos)?\\s*(?:de\\s+)?${label}\\b`, flags),
    ];
    return expressions.some((expression) =>
      [...text.matchAll(expression)].some(
        (match) =>
          value(match[1]) === expected.min &&
          value(match[2] ?? match[1]) === expected.max,
      ),
    );
  };

  if (
    !Object.entries(labels).every(
      ([key, label]) =>
        matches(label, input[key as keyof typeof labels]) ||
        (key === "fat" && matches("G", input.fat, "g")),
    )
  ) {
    return false;
  }

  const basisPattern = /\b(?:por|cada)\s*(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos)\b/gi;
  const evidenceBases = [...input.evidence.matchAll(basisPattern)];
  const bases = evidenceBases.length
    ? evidenceBases
    : [...message.matchAll(basisPattern)];

  if (bases.length) {
    return bases.every((match) => value(match[1]) === input.basisGrams);
  }

  // Without an explicit reference base, the supplied values describe the stated amount.
  const amount = message.match(/\b(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos)\b/i);
  return !!amount && value(amount[1]) === input.basisGrams;
}

const keys = ["calories", "protein", "carbs", "fat"] as const;

export const normalizeFoodName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function customFood(
  name: string,
  input: CustomNutrition,
  existing?: CustomFood,
): CustomFood {
  customNutritionSchema.parse(input);
  const ranges = {} as MacroRanges;
  const per100g = {} as Macros;

  for (const key of keys) {
    if (input[key].min > input[key].max) {
      throw new AssistantError(
        "El límite inferior de un rango no puede superar el superior. Revisa los valores; no se ha guardado nada.",
      );
    }
    ranges[key] = {
      min: (input[key].min * 100) / input.basisGrams,
      max: (input[key].max * 100) / input.basisGrams,
    };
    if (ranges[key].max > (key === "calories" ? 1000 : 100)) {
      throw new AssistantError(
        "Los valores indicados no son válidos por 100 g. Comprueba la cantidad de referencia; no se ha guardado nada.",
      );
    }
    per100g[key] = (ranges[key].min + ranges[key].max) / 2;
  }
  return {
    id: existing?.id ?? randomUUID(),
    name,
    per100g,
    ranges,
    evidence: input.evidence,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function customFoodEntry(
  food: CustomFood,
  name: string,
  grams: number,
  meal: FoodEntry["meal"],
  eatenAt: string,
): Omit<FoodEntry, "id" | "createdAt"> {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10000) {
    throw new AssistantError(
      "Indica la cantidad consumida en gramos para usar tu alimento personalizado.",
    );
  }

  const scale = (n: number) => Math.round(((n * grams) / 100) * 10) / 10;
  const scaleRange = (key: keyof MacroRanges) => ({
    min: scale(food.ranges[key].min),
    max: scale(food.ranges[key].max),
  });
  const amountRanges: MacroRanges = {
    calories: scaleRange("calories"),
    protein: scaleRange("protein"),
    carbs: scaleRange("carbs"),
    fat: scaleRange("fat"),
  };
  return {
    name,
    quantity: `${new Intl.NumberFormat("es-ES").format(grams)} g`,
    meal,
    eatenAt,
    calories: Math.round((food.per100g.calories * grams) / 100),
    protein: scale(food.per100g.protein),
    carbs: scale(food.per100g.carbs),
    fat: scale(food.per100g.fat),
    source: {
      provider: "Datos del usuario",
      customFoodId: food.id,
      basis: "100g",
      perBasis: food.per100g,
      ranges: food.ranges,
      amountRanges,
      amount: grams,
      unit: "g",
      evidence: food.evidence,
    },
  };
}
