import { z } from "zod";
import { labelSchema } from "../label.js";
import { customNutritionSchema } from "../custom-food.js";
import { estimateSchema } from "../estimate.js";
const patchNutrient = z.number().finite().nonnegative().max(10000).nullable();

export const nutrientPatchSchema = z
  .object({
    basis: z.enum(["100g", "100ml", "serving", "entry"]),
    calories: patchNutrient,
    protein: patchNutrient,
    carbs: patchNutrient,
    fat: patchNutrient,
    evidence: z.string().min(1).max(1200),
  })
  .strict();

const mealSchema = z.enum(["Desayuno", "Comida", "Cena", "Snack"]);

export const parsedMeal = z
  .object({
    action: z.enum(["add", "correct", "answer", "coach"]).default("add"),
    clarification: z.string().max(1200).nullable(),
    foods: z
      .array(
        z
          .object({
            entryId: z.string().uuid().nullable().default(null),
            eatenDate: z.string().date().nullable().default(null),
            nutrientPatch: nutrientPatchSchema.nullable().default(null),
            keepSource: z.boolean().default(false),
            name: z.string().min(1).max(160),
            queries: z.array(z.string().min(1).max(160)).min(1).max(3),
            grams: z.number().positive().max(10_000).nullable(),
            milliliters: z.number().positive().max(10_000).nullable(),
            label: labelSchema.nullable(),
            estimate: estimateSchema.nullable().default(null),
            customNutrition: customNutritionSchema.nullable().default(null),
            customFoodId: z.string().uuid().nullable().default(null),
            saveOnly: z.boolean().default(false),
            portionCount: z.number().positive().max(100).nullable(),
            portionDescription: z.string().min(1).max(160).nullable(),
            meal: mealSchema.nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const matchedMeal = z
  .object({
    clarification: z.string().max(1200).nullable(),
    matches: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            fdcId: z.number().int().positive(),
            portionIndex: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export type ParsedFood = z.output<typeof parsedMeal>["foods"][number];

export const estimatedFoods = z
  .object({
    foods: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            estimate: estimateSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
