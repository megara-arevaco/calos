import dataset from "./data/usda-sr-legacy.json" with { type: "json" };
import type { FoodEntry, Macros } from "./types.js";

export interface CatalogueFood {
  fdcId: number;
  description: string;
  per100g: Macros;
  portions: { description: string; amount: number; grams: number }[];
}

export const catalogue: readonly CatalogueFood[] = dataset.foods;
const stopWords = new Set(["and", "with", "the", "of", "a", "an", "or"]);

const tokens = (text: string) =>
  [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(
    (word) => !stopWords.has(word),
  );

const indexed = catalogue.map((food) => ({
  food,
  words: new Set(tokens(food.description)),
}));

const frequencies = new Map<string, number>();

for (const { words } of indexed) {
  for (const word of words) {
    frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }
}

/** English queries come from the LLM; nutrient values always come from the local USDA data. */
export function searchFoods(queries: string[], limit = 16): CatalogueFood[] {
  const searches = queries.map(tokens).filter((words) => words.length);
  return indexed
    .map(({ food, words }) => {
      const score = Math.max(
        0,
        ...searches.map((query) => {
          const matched = query.filter((word) => words.has(word));

          if (matched.length < Math.min(2, query.length)) {
            return 0;
          }

          const relevance = matched.reduce(
            (sum, word) =>
              sum + Math.log(1 + catalogue.length / (frequencies.get(word) ?? 1)),
            0,
          );
          return (
            (relevance * (matched.length / query.length) ** 3) /
            (1 + words.size * 0.025)
          );
        }),
      );
      return { food, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.food.fdcId - b.food.fdcId)
    .slice(0, limit)
    .map(({ food }) => food);
}

export function foodEntry(
  food: CatalogueFood,
  name: string,
  grams: number,
  meal: FoodEntry["meal"],
  eatenAt: string,
  portion?: string,
): Omit<FoodEntry, "id" | "createdAt"> {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 10_000) {
    throw new Error("Cantidad de alimento no válida");
  }

  const scale = (value: number) => Math.round(((value * grams) / 100) * 10) / 10;
  return {
    name,
    quantity: `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(grams)} g${portion ? ` (${portion})` : ""}`,
    meal,
    eatenAt,
    calories: Math.round((food.per100g.calories * grams) / 100),
    protein: scale(food.per100g.protein),
    carbs: scale(food.per100g.carbs),
    fat: scale(food.per100g.fat),
    source: {
      provider: "USDA FoodData Central",
      dataset: "SR Legacy 2018-04",
      fdcId: food.fdcId,
      description: food.description,
      grams,
      ...(portion ? { portion } : {}),
    },
  };
}
