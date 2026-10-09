import { nutritionPlanSchema, nutritionPlanProposalSchema } from "./plan-schema.js";
import { plateDraftSchema } from "./plate-schema.js";
import { userProfileInputSchema } from "./profile-schema.js";
import { onboardingHistorySchema } from "./onboarding.js";
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
  "profiles:list": z.tuple([]),
  "profiles:create": z.tuple([userProfileInputSchema]),
  "profiles:onboarding": z.tuple([text, onboardingHistorySchema]),
  "profiles:select": z.tuple([id]),
  "nutrition:plan": z.tuple([id]),
  "nutrition:plan-save": z.tuple([id, nutritionPlanSchema, nutritionPlanSchema]),
  "nutrition:today": z.tuple([id, z.string().date()]),
  "nutrition:food-history": z.tuple([id]),
  "nutrition:delete": z.tuple([id, id]),
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
