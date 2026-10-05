import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function createProfile(
  page: Page,
  name = "Perfil de prueba",
  instructions = "",
  calories = "2200",
) {
  await expect(page.getByRole("heading", { name: "Crea tu perfil" })).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill(name);
  await page.getByLabel("Edad", { exact: true }).fill("35");
  await page.getByLabel("Altura (cm)", { exact: true }).fill("175");
  await page.getByLabel("Peso actual (kg)", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hazlo a tu manera" })).toBeVisible();
  await page.getByLabel("Objetivo diario (kcal)").fill(calories);
  await page.getByLabel("Cómo quieres que te acompañe (opcional)").fill(instructions);
  await page.getByRole("button", { name: "Empezar mi diario" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
}
