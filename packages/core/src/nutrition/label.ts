import { z } from "zod";
import { AssistantError } from "./openrouter.js";
import type { FoodEntry, Macros } from "./types.js";

const nutrient = z.number().finite().nonnegative().max(10000).nullable();

export const labelSchema = z
  .object({
    basis: z.enum(["100g", "100ml", "serving"]),
    servingGrams: z.number().positive().max(10000).nullable(),
    calories: nutrient,
    kilojoules: z.number().finite().nonnegative().max(50000).nullable(),
    protein: nutrient,
    carbs: nutrient,
    fat: nutrient,
    evidence: z.string().min(1).max(800),
  })
  .strict();

export type LabelNutrition = z.infer<typeof labelSchema>;

export function labelEntry(
  label: LabelNutrition,
  item: {
    name: string;
    grams: number | null;
    milliliters: number | null;
    portionCount: number | null;
    portionDescription: string | null;
  },
  meal: FoodEntry["meal"],
  eatenAt: string,
): Omit<FoodEntry, "id" | "createdAt"> {
  const energy =
    label.calories ?? (label.kilojoules === null ? null : label.kilojoules / 4.184);

  if (
    energy === null ||
    label.protein === null ||
    label.carbs === null ||
    label.fat === null
  ) {
    throw new AssistantError(
      "La etiqueta no permite leer las calorías y los tres macronutrientes. Adjunta una foto más clara o indica los valores; no se ha guardado ninguna comida.",
    );
  }

  let amount: number | null = null;
  let unit: "g" | "ml" | "ración";
  let divisor: number;

  if (label.basis === "100g") {
    unit = "g";
    divisor = 100;
    amount =
      item.grams ??
      (item.portionCount !== null &&
      item.portionDescription === "serving" &&
      label.servingGrams !== null
        ? item.portionCount * label.servingGrams
        : null);
  } else if (label.basis === "100ml") {
    unit = "ml";
    divisor = 100;
    amount = item.milliliters;
  } else {
    unit = "ración";
    divisor = 1;
    amount =
      item.portionCount !== null && item.portionDescription === "serving"
        ? item.portionCount
        : item.grams !== null && label.servingGrams !== null
          ? item.grams / label.servingGrams
          : null;
  }
  if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    throw new AssistantError(
      `¿Qué cantidad has consumido en ${unit === "ración" ? "raciones de la etiqueta" : unit}? Usaré los valores de la foto cuando me lo indiques.`,
    );
  }

  const perBasis: Macros = {
    calories: energy,
    protein: label.protein,
    carbs: label.carbs,
    fat: label.fat,
  };
  const scale = (value: number) => Math.round(((value * amount) / divisor) * 10) / 10;
  return {
    name: item.name,
    quantity: `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(amount)} ${unit === "ración" && amount !== 1 ? "raciones" : unit}`,
    meal,
    eatenAt,
    calories: Math.round((energy * amount) / divisor),
    protein: scale(perBasis.protein),
    carbs: scale(perBasis.carbs),
    fat: scale(perBasis.fat),
    source: {
      provider: "Etiqueta nutricional",
      basis: label.basis,
      perBasis,
      amount,
      unit,
      evidence: label.evidence,
    },
  };
}
