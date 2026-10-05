import { z } from "zod";
import type { NutritionSnapshot } from "./types.js";

export const nutritionObjectivesSchema = z
  .object({
    goal: z.string().trim().min(1).max(500),
    targetWeightKg: z.number().finite().min(10).max(500).nullable(),
    targetDate: z.string().date().nullable(),
    habits: z.array(z.string().trim().min(1).max(300)).max(8),
    notes: z.string().trim().max(2000),
  })
  .strict();

export const nutritionPlanSchema = nutritionObjectivesSchema
  .extend({
    dailyGoal: z
      .object({
        calories: z.number().int().min(300).max(10000),
        protein: z.number().finite().min(0).max(1000),
        carbs: z.number().finite().min(0).max(2000),
        fat: z.number().finite().min(0).max(1000),
      })
      .strict(),
  })
  .strict();

export type NutritionObjectives = z.infer<typeof nutritionObjectivesSchema>;

export type NutritionPlan = z.infer<typeof nutritionPlanSchema>;

export const nutritionPlanProposalSchema = z
  .object({ plan: nutritionPlanSchema, previousPlan: nutritionPlanSchema })
  .strict();

export type NutritionPlanProposal = z.infer<typeof nutritionPlanProposalSchema>;

export function planFromSnapshot(state: NutritionSnapshot): NutritionPlan {
  return nutritionPlanSchema.parse({
    goal: state.profile?.goal || "Definir mi objetivo",
    targetWeightKg: null,
    targetDate: null,
    habits: [],
    notes: "",
    ...state.objectives,
    dailyGoal: state.dailyGoal,
  });
}
