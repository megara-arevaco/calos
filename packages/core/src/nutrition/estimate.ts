import { z } from "zod";
import { labelEntry } from "./label.js";
import { AssistantError } from "./openrouter.js";
import type { FoodEntry } from "./types.js";

export const estimateSchema = z
  .object({
    calories: z.number().finite().nonnegative().max(1000),
    protein: z.number().finite().nonnegative().max(100),
    carbs: z.number().finite().nonnegative().max(100),
    fat: z.number().finite().nonnegative().max(100),
    reason: z.string().trim().min(1).max(600),
    assumptions: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  })
  .strict();

export type EstimatedNutrition = z.infer<typeof estimateSchema>;

export function estimatedEntry(
  input: EstimatedNutrition,
  item: { name: string; grams: number | null },
  meal: FoodEntry["meal"],
  eatenAt: string,
): Omit<FoodEntry, "id" | "createdAt"> {
  const estimate = estimateSchema.parse(input);

  if (
    item.grams === null ||
    !Number.isFinite(item.grams) ||
    item.grams <= 0 ||
    item.grams > 10000
  ) {
    throw new AssistantError(
      `Puedo estimar «${item.name}». ¿Cuántos gramos has consumido?`,
    );
  }

  if (estimate.protein + estimate.carbs + estimate.fat > 100) {
    throw new Error("Estimated macronutrients exceed 100 g per 100 g");
  }

  const evidence = `Estimación del asistente: ${estimate.reason}`;
  const entry = labelEntry(
    {
      basis: "100g",
      ...estimate,
      servingGrams: null,
      kilojoules: null,
      evidence,
    },
    { ...item, milliliters: null, portionCount: null, portionDescription: null },
    meal,
    eatenAt,
  );

  if (entry.source?.provider !== "Etiqueta nutricional") {
    throw new Error("Invalid estimate source");
  }
  return {
    ...entry,
    source: {
      provider: "Estimación",
      basis: "100g",
      perBasis: entry.source.perBasis,
      amount: entry.source.amount,
      unit: "g",
      evidence,
      assumptions: estimate.assumptions,
    },
  };
}

export function estimateNotice(entries: FoodEntry[]) {
  const estimated = entries.filter((entry) => entry.source?.provider === "Estimación");

  const photos = entries.filter((entry) => entry.source?.photoEstimate);
  const volumes = entries.filter((entry) => entry.source?.volumeEstimate);
  const volumeNotice = volumes.length
    ? ` Aviso: conversión de volumen a peso aproximada. ${volumes.map((entry) => `${entry.name}: ${entry.source!.volumeEstimate!.milliliters} ml usando ${entry.source!.volumeEstimate!.gramsPerMilliliter} g/ml. ${entry.source!.volumeEstimate!.assumption}`).join(" ")}`
    : "";
  const photoNotice = photos.length
    ? ` Aviso: registro basado en una foto del plato; la composición${photos.some((entry) => entry.source?.photoEstimate?.estimatedGrams) ? " y las cantidades visuales son aproximadas" : " es aproximada"}. Suposiciones: ${[...new Set(photos.flatMap((entry) => entry.source?.photoEstimate?.assumptions ?? []))].join("; ")}. Puedes corregir los ingredientes o los pesos.`
    : "";

  if (!estimated.length) {
    return photoNotice + volumeNotice;
  }
  return ` Aviso: ${estimated.map((entry) => entry.name).join("; ")} ${estimated.length === 1 ? "se ha registrado" : "se han registrado"} con valores aproximados estimados por el asistente, sin una receta o referencia exacta. Suposiciones: ${estimated.flatMap((entry) => (entry.source?.provider === "Estimación" ? entry.source.assumptions : [])).join("; ")}. Puedes corregir los ingredientes o aportar una etiqueta para afinar el cálculo.${photoNotice}${volumeNotice}`;
}
