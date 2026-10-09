import { test, expect } from "./fixtures.js";
import { createProfile } from "./onboarding.js";

test("web: cada navegador conserva su perfil y la API rechaza entradas inválidas", async ({
  webApp,
}) => {
  const page = webApp.page;
  const originalName = await page
    .getByLabel("Perfil activo")
    .locator("option:checked")
    .textContent();
  const other = await webApp.newBrowserPage();
  await other.getByRole("button", { name: "Nuevo perfil" }).click();
  await createProfile(other, "Otra persona");
  await page.reload();
  await expect(page.getByLabel("Perfil activo").locator("option:checked")).toHaveText(
    originalName!,
  );
  await other.reload();
  await expect(other.getByLabel("Perfil activo").locator("option:checked")).toHaveText(
    "Otra persona",
  );
  const response = await page.request.post(
    new URL("/api/rpc/nutrition:weight-save", page.url()).href,
    {
      data: ["../../otro-perfil", { date: "2026-01-01", kilograms: 70 }],
    },
  );
  expect(response.status()).toBe(400);
  const crossOrigin = await page.request.post(
    new URL("/api/rpc/profiles:list", page.url()).href,
    {
      headers: { Origin: "https://otro.example" },
      data: [],
    },
  );
  expect(crossOrigin.status()).toBe(403);
});
