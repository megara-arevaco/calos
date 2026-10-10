import { z } from "zod";
import { nutritionObjectivesSchema } from "./plan-schema.js";

const macrosSchema = z
  .object({
    calories: z.number().finite().min(0).max(100_000),
    protein: z.number().finite().min(0).max(10_000),
    carbs: z.number().finite().min(0).max(10_000),
    fat: z.number().finite().min(0).max(10_000),
  })
  .strict();

const rangesSchema = z
  .object({
    calories: z
      .object({
        min: z.number().finite().min(0).max(100_000),
        max: z.number().finite().min(0).max(100_000),
      })
      .strict(),
    protein: z
      .object({
        min: z.number().finite().min(0).max(10_000),
        max: z.number().finite().min(0).max(10_000),
      })
      .strict(),
    carbs: z
      .object({
        min: z.number().finite().min(0).max(10_000),
        max: z.number().finite().min(0).max(10_000),
      })
      .strict(),
    fat: z
      .object({
        min: z.number().finite().min(0).max(10_000),
        max: z.number().finite().min(0).max(10_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((ranges, context) => {
    for (const [key, value] of Object.entries(ranges)) {
      if (value.min > value.max) {
        context.addIssue({ code: "custom", path: [key], message: "Rango no válido" });
      }
    }
  });

const sourceMetadata = {
  volumeEstimate: z
    .object({
      milliliters: z.number().positive().max(10_000),
      gramsPerMilliliter: z.number().positive().max(10),
      assumption: z.string().min(1).max(500),
    })
    .strict()
    .optional(),
  photoEstimate: z
    .object({
      estimatedGrams: z.boolean(),
      assumptions: z.array(z.string().min(1).max(500)).max(20),
    })
    .strict()
    .optional(),
};

const sourceSchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("Estimación"),
      basis: z.literal("100g"),
      perBasis: macrosSchema,
      amount: z.number().positive().max(10_000),
      unit: z.literal("g"),
      evidence: z.string().min(1).max(1200),
      assumptions: z.array(z.string().min(1).max(500)).max(20),
      ...sourceMetadata,
    })
    .strict(),
  z
    .object({
      provider: z.literal("USDA FoodData Central"),
      dataset: z.literal("SR Legacy 2018-04"),
      fdcId: z.number().int().positive(),
      description: z.string().min(1).max(300),
      grams: z.number().positive().max(10_000),
      portion: z.string().max(200).optional(),
      ...sourceMetadata,
    })
    .strict(),
  z
    .object({
      provider: z.literal("Etiqueta nutricional"),
      basis: z.enum(["100g", "100ml", "serving"]),
      perBasis: macrosSchema,
      amount: z.number().positive().max(10_000),
      unit: z.enum(["g", "ml", "ración"]),
      evidence: z.string().min(1).max(1200),
      ...sourceMetadata,
    })
    .strict(),
  z
    .object({
      provider: z.literal("Datos del usuario"),
      customFoodId: z.string().uuid().optional(),
      basis: z.enum(["100g", "100ml", "serving"]),
      perBasis: macrosSchema,
      ranges: rangesSchema,
      amountRanges: rangesSchema.optional(),
      amount: z.number().positive().max(10_000),
      unit: z.enum(["g", "ml", "ración"]),
      evidence: z.string().min(1).max(1200),
      ...sourceMetadata,
    })
    .strict(),
]);

const entryContentSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    quantity: z.string().trim().min(1).max(200),
    meal: z.enum(["Desayuno", "Comida", "Cena", "Snack"]),
    eatenAt: z.string().datetime({ offset: true }),
    calories: macrosSchema.shape.calories,
    protein: macrosSchema.shape.protein,
    carbs: macrosSchema.shape.carbs,
    fat: macrosSchema.shape.fat,
    source: sourceSchema.optional(),
  })
  .strict();

export const foodEntrySchema = entryContentSchema
  .extend({
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    age: z.number().int().min(1).max(120).optional(),
    activity: z.enum(["low", "moderate", "high"]).optional(),
    dietaryPreferences: z.string().max(1000).optional(),
    assistantInstructions: z.string().max(2000).optional(),
    heightCm: z.number().finite().min(50).max(250),
    weightKg: z.number().finite().min(10).max(500),
    goal: z.string().trim().min(1).max(500),
  })
  .strict();

const customFoodSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    per100g: macrosSchema,
    ranges: rangesSchema,
    evidence: z.string().min(1).max(1200),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

const waistMeasurementSchema = z
  .object({
    id: z.string().uuid(),
    date: z.string().date(),
    centimeters: z.number().finite().min(0.1).max(300),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

const weightMeasurementSchema = z
  .object({
    id: z.string().uuid(),
    date: z.string().date(),
    kilograms: z.number().finite().min(0.1).max(500),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const foodTemplateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    createdAt: z.string().datetime({ offset: true }),
    baseServings: z.number().finite().positive().max(1000).default(1),
    entries: z.array(entryContentSchema).min(1).max(20),
  })
  .strict();

const undoOperationSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    before: z.array(foodEntrySchema).max(100),
    after: z.array(foodEntrySchema).max(100),
    beforeReferences: z.array(customFoodSchema).max(100),
    afterReferences: z.array(customFoodSchema).max(100),
  })
  .strict();

const retentionSchema = z
  .object({
    trashDays: z.number().int().min(1).max(3650).nullable(),
    backupsDays: z.number().int().min(1).max(3650).nullable(),
  })
  .strict();

export const nutritionSnapshotSchema = z
  .object({
    version: z.literal(1),
    objectives: nutritionObjectivesSchema.optional(),
    entries: z.array(foodEntrySchema).max(100_000),
    deletedEntries: z
      .array(
        foodEntrySchema
          .extend({ deletedAt: z.string().datetime({ offset: true }) })
          .strict(),
      )
      .max(100_000)
      .optional(),
    templates: z.array(foodTemplateSchema).max(500).optional(),
    undoOperations: z.array(undoOperationSchema).max(50).optional(),
    retention: retentionSchema.optional(),
    customFoods: z.array(customFoodSchema).max(10_000),
    dailyGoal: z
      .object({
        calories: z.number().int().min(300).max(10_000),
        protein: z.number().finite().min(0).max(1000),
        carbs: z.number().finite().min(0).max(2000),
        fat: z.number().finite().min(0).max(1000),
      })
      .strict(),
    waistMeasurements: z.array(waistMeasurementSchema).max(100_000),
    weightMeasurements: z.array(weightMeasurementSchema).max(100_000),
    profile: profileSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const unique = (values: string[], path: string[]) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          path,
          message: "Hay identificadores duplicados",
        });
      }
    };
    unique(
      [
        ...snapshot.entries.map((entry) => entry.id),
        ...(snapshot.deletedEntries ?? []).map((entry) => entry.id),
      ],
      ["entries"],
    );
    unique(
      snapshot.customFoods.map((food) => food.id),
      ["customFoods"],
    );
    unique(
      (snapshot.templates ?? []).map((template) => template.id),
      ["templates"],
    );
    unique(
      (snapshot.undoOperations ?? []).map((operation) => operation.id),
      ["undoOperations"],
    );
    unique(
      snapshot.waistMeasurements.map((item) => item.date),
      ["waistMeasurements"],
    );
    unique(
      snapshot.weightMeasurements.map((item) => item.date),
      ["weightMeasurements"],
    );
    const customIds = new Set(snapshot.customFoods.map((food) => food.id));
    const allEntries = [
      ...snapshot.entries,
      ...(snapshot.deletedEntries ?? []),
      ...(snapshot.templates ?? []).flatMap((template) => template.entries),
    ];
    allEntries.forEach((entry, index) => {
      if (
        entry.source?.provider === "Datos del usuario" &&
        entry.source.customFoodId &&
        !customIds.has(entry.source.customFoodId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "source", "customFoodId"],
          message: "La referencia del alimento no existe",
        });
      }
    });
  });

export type NutritionSnapshotInput = z.input<typeof nutritionSnapshotSchema>;

export type NutritionEntryContent = z.output<typeof entryContentSchema>;
export { entryContentSchema, macrosSchema };
