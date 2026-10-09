import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { UserProfileInput } from "@calos/core";

type Mock = (replies: { name: string; content: unknown }[]) => Promise<void>;

const providers = new WeakMap<Page, Mock>();

export function registerOnboardingProvider(page: Page, mock: Mock) {
  providers.set(page, mock);
}

export function profileProposal(
  name = "Perfil de prueba",
  instructions = "",
  calories = "2200",
): UserProfileInput {
  return {
    name,
    age: 35,
    heightCm: 175,
    weightKg: 80,
    goal: "Mantener mi peso",
    activity: "moderate",
    dietaryPreferences: "",
    assistantInstructions: instructions,
    dailyCalories: Number(calories),
    dailyProtein: 140,
    dailyCarbs: calories === "2200" ? 250 : (Number(calories) - 560 - 630) / 4,
    dailyFat: 70,
    targetWeightKg: null,
    targetDate: null,
    habits: [],
  };
}

export async function createProfile(
  page: Page,
  name = "Perfil de prueba",
  instructions = "",
  calories = "2200",
) {
  await expect(
    page.getByRole("region", { name: "Crear tu perfil", exact: true }),
  ).toBeVisible();
  const mock = providers.get(page);

  if (!mock) {
    throw new Error("El proveedor E2E no está registrado");
  }
  await mock([
    {
      name: "profile_onboarding",
      content: {
        message: `Te propongo ${calories} kcal como punto de partida para mantener tu peso.`,
        profile: profileProposal(name, instructions, calories),
      },
    },
  ]);
  await page
    .getByLabel("Tu mensaje", { exact: true })
    .fill(
      `Soy ${name}, tengo 35 años, mido 175 cm, peso 80 kg, soy hombre y tengo actividad moderada. Quiero mantener mi peso. Objetivo ya pautado: ${calories} kcal. ${instructions}`,
    );
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar objetivos y empezar" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
}
