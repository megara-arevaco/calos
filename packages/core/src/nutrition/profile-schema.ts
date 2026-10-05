import { z } from "zod";

export const userProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    age: z.number().int().min(1).max(120),
    heightCm: z.number().finite().min(50).max(250),
    weightKg: z.number().finite().min(10).max(500),
    goal: z.string().trim().min(1).max(500),
    activity: z.enum(["low", "moderate", "high"]),
    dietaryPreferences: z.string().trim().max(1000),
    assistantInstructions: z.string().trim().max(2000),
    dailyProtein: z.number().finite().min(0).max(1000).optional().default(140),
    dailyCarbs: z.number().finite().min(0).max(2000).optional().default(250),
    dailyFat: z.number().finite().min(0).max(1000).optional().default(70),
    targetWeightKg: z
      .number()
      .finite()
      .min(10)
      .max(500)
      .nullable()
      .optional()
      .default(null),
    targetDate: z.string().date().nullable().optional().default(null),
    habits: z.array(z.string().trim().min(1).max(300)).max(8).optional().default([]),
    dailyCalories: z.number().int().min(300).max(10000),
  })
  .strict();

export type UserProfileInput = z.input<typeof userProfileInputSchema>;

export const localProfileSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    createdAt: z.string(),
  })
  .strict();

export type LocalProfile = z.infer<typeof localProfileSchema>;

export const profileRegistrySchema = z
  .object({
    version: z.literal(1),
    activeId: z.string().uuid().nullable(),
    profiles: z.array(localProfileSchema).max(100),
  })
  .strict();

export type ProfileRegistry = z.infer<typeof profileRegistrySchema>;
