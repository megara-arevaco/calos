import { nutritionPlanSchema, nutritionPlanProposalSchema } from "./plan-schema.js";
import { plateDraftSchema } from "./plate-schema.js";
import { userProfileInputSchema } from "./profile-schema.js";
import { onboardingHistorySchema } from "./onboarding.js";
import {
  foodEntrySchema,
  foodTemplateSchema,
  macrosSchema,
  nutritionSnapshotSchema,
} from "./snapshot-schema.js";
import { z } from "zod";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(2_000);

const image = z
  .object({
    kind: z.enum(["label", "plate"]).default("label"),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z
      .string()
      .min(1)
      .max(8_388_608)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .refine((value) => {
    const bytes = Buffer.from(value.base64, "base64");

    if (bytes.length > 6 * 1024 * 1024) {
      return false;
    }
    return value.mimeType === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : value.mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  }, "La imagen debe ser JPG, PNG o WebP y tener como máximo 6 MB")
  .optional();

export const rpcContracts = {
  "assistant:usage": z.tuple([]),
  "profiles:list": z.tuple([]),
  "profiles:create": z.tuple([userProfileInputSchema]),
  "profiles:onboarding": z.tuple([text, onboardingHistorySchema]),
  "profiles:select": z.tuple([id]),
  "nutrition:plan": z.tuple([id]),
  "nutrition:plan-save": z.tuple([id, nutritionPlanSchema, nutritionPlanSchema]),
  "nutrition:today": z.tuple([id, z.string().date()]),
  "nutrition:food-history": z.tuple([id]),
  "nutrition:delete": z.tuple([id, id]),
  "nutrition:undo": z.tuple([id, id]),
  "nutrition:undo-history": z.tuple([id]),
  "nutrition:restore": z.tuple([id, id]),
  "nutrition:trash": z.tuple([id]),
  "nutrition:trash-delete": z.tuple([id, id]),
  "nutrition:food-save": z.tuple([
    id,
    z
      .object({
        entryId: id.nullable().default(null),
        expected: foodEntrySchema.nullable().default(null),
        name: z.string().trim().min(1).max(160),
        quantity: z.string().trim().min(1).max(200),
        meal: z.enum(["Desayuno", "Comida", "Cena", "Snack"]),
        date: z.string().date(),
        ...macrosSchema.shape,
        provider: z.enum(["Etiqueta nutricional", "Datos del usuario"]),
        evidence: z.string().trim().min(1).max(1200),
      })
      .strict()
      .superRefine((value, context) => {
        if (Boolean(value.entryId) !== Boolean(value.expected)) {
          context.addIssue({
            code: "custom",
            path: ["expected"],
            message: "Edición no válida",
          });
        }
        if (value.expected && value.expected.id !== value.entryId) {
          context.addIssue({
            code: "custom",
            path: ["entryId"],
            message: "Identificador no válido",
          });
        }
      }),
  ]),
  "nutrition:repeat-entry": z.tuple([id, id, z.string().date()]),
  "nutrition:templates": z.tuple([id]),
  "nutrition:template-save": z.tuple([
    id,
    z
      .object({
        name: z.string().trim().min(1).max(80),
        entryIds: z.array(id).min(1).max(20),
        baseServings: z.number().finite().positive().max(1000).default(1),
      })
      .strict(),
  ]),
  "nutrition:template-update": z.tuple([id, foodTemplateSchema, foodTemplateSchema]),
  "nutrition:template-repeat": z.tuple([
    id,
    id,
    z.string().date(),
    z.number().finite().positive().max(1000).default(1),
  ]),
  "nutrition:backups": z.tuple([id]),
  "nutrition:backup-download": z.tuple([id, id]),
  "nutrition:backup-restore": z.tuple([id, id]),
  "nutrition:backup-delete": z.tuple([id, id]),
  "nutrition:retention": z.tuple([id]),
  "nutrition:retention-save": z.tuple([
    id,
    z
      .object({
        trashDays: z.number().int().min(1).max(3650).nullable(),
        backupsDays: z.number().int().min(1).max(3650).nullable(),
      })
      .strict(),
  ]),
  "nutrition:export": z.tuple([id]),
  "nutrition:import": z.tuple([id, nutritionSnapshotSchema]),
  "nutrition:chat": z.tuple([
    id,
    text,
    z
      .array(
        z.object({ role: z.enum(["assistant", "user"]), text: z.string().max(4000) }),
      )
      .max(10),
    image,
    z
      .object({
        plateDraft: plateDraftSchema.optional(),
        goalDraft: nutritionPlanProposalSchema.optional(),
        date: z.string().date(),
        mode: z.enum(["day", "history"]),
        tab: z.enum(["comida", "cintura", "peso", "asistente"]).default("comida"),
      })
      .optional(),
  ]),
  "nutrition:waist-history": z.tuple([id]),
  "nutrition:waist-save": z.tuple([
    id,
    z
      .object({
        date: z.string().date(),
        centimeters: z.number().finite().min(0.1).max(300),
      })
      .strict(),
  ]),
  "nutrition:waist-delete": z.tuple([id, id]),
  "nutrition:weight-history": z.tuple([id]),
  "nutrition:weight-save": z.tuple([
    id,
    z
      .object({
        date: z.string().date(),
        kilograms: z.number().finite().min(0.1).max(500),
      })
      .strict(),
  ]),
  "nutrition:weight-delete": z.tuple([id, id]),
} as const;

export type RpcChannel = keyof typeof rpcContracts;

export type RpcArgs<K extends RpcChannel> = z.output<(typeof rpcContracts)[K]>;

export type RpcInput<K extends RpcChannel> = z.input<(typeof rpcContracts)[K]>;
