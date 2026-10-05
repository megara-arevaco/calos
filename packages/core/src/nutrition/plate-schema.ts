import { z } from "zod";

export const plateDraftSchema = z
  .object({
    dishName: z.string().trim().min(1).max(160),
    meal: z.enum(["Desayuno", "Comida", "Cena", "Snack"]).nullable(),
    foods: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            grams: z.number().finite().positive().max(10000).nullable(),
            quantityOrigin: z.enum(["visual", "user"]),
            queries: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
          })
          .strict(),
      )
      .max(20),
    assumptions: z.array(z.string().trim().min(1).max(300)).max(12),
    questions: z.array(z.string().trim().min(1).max(500)).max(3),
  })
  .strict();

export type PlateDraft = z.infer<typeof plateDraftSchema>;

export const plateReplySchema = z
  .object({
    intent: z.enum(["clarify", "record", "cancel", "answer"]),
    message: z.string().trim().min(1).max(1200),
    draft: plateDraftSchema,
  })
  .strict();
