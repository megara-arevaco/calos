import type { FoodEntry, MacroRanges, NutritionSource } from "./types.js";

const scaleValue = (value: number, factor: number) =>
  Math.round(value * factor * 1000) / 1000;

function scaleRanges(ranges: MacroRanges, factor: number): MacroRanges {
  return {
    calories: {
      min: scaleValue(ranges.calories.min, factor),
      max: scaleValue(ranges.calories.max, factor),
    },
    protein: {
      min: scaleValue(ranges.protein.min, factor),
      max: scaleValue(ranges.protein.max, factor),
    },
    carbs: {
      min: scaleValue(ranges.carbs.min, factor),
      max: scaleValue(ranges.carbs.max, factor),
    },
    fat: {
      min: scaleValue(ranges.fat.min, factor),
      max: scaleValue(ranges.fat.max, factor),
    },
  };
}

/** Scale a component without changing its measurement unit or source confidence. */
export function scaleRecipeEntry(
  entry: Omit<FoodEntry, "id" | "createdAt">,
  factor: number,
): Omit<FoodEntry, "id" | "createdAt"> {
  const source = entry.source;
  const scaledMetadata = source
    ? {
        ...(source.volumeEstimate
          ? {
              volumeEstimate: {
                ...source.volumeEstimate,
                milliliters: scaleValue(source.volumeEstimate.milliliters, factor),
              },
            }
          : {}),
        ...(source.photoEstimate ? { photoEstimate: source.photoEstimate } : {}),
      }
    : {};
  const scaledSource: NutritionSource | undefined = !source
    ? undefined
    : source.provider === "USDA FoodData Central"
      ? { ...source, ...scaledMetadata, grams: scaleValue(source.grams, factor) }
      : source.provider === "Datos del usuario"
        ? {
            ...source,
            ...scaledMetadata,
            amount: scaleValue(source.amount, factor),
            amountRanges: scaleRanges(
              source.amountRanges ??
                scaleRanges(
                  source.ranges,
                  source.basis === "serving" ? source.amount : source.amount / 100,
                ),
              factor,
            ),
          }
        : {
            ...source,
            ...scaledMetadata,
            amount: scaleValue(source.amount, factor),
          };
  const multiplier = factor === 1 ? "" : ` · ×${Number(factor.toFixed(3))} receta`;
  return {
    ...entry,
    quantity: `${entry.quantity}${multiplier}`,
    calories: scaleValue(entry.calories, factor),
    protein: scaleValue(entry.protein, factor),
    carbs: scaleValue(entry.carbs, factor),
    fat: scaleValue(entry.fat, factor),
    ...(scaledSource ? { source: scaledSource } : {}),
  };
}
