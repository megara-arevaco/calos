import { test, expect } from "./fixtures.js";

test("calos: cambia y recuerda el idioma de la interfaz", async ({ webApp }) => {
  const page = webApp.page;
  const language = page.getByLabel("Idioma");

  await language.selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Food", exact: true })).toBeVisible();
  await expect(page.getByLabel("Active profile")).toBeVisible();
  await page.getByText("What data is sent", { exact: true }).click();
  await expect(
    page.getByText(/A request can include your message, up to 10 previous messages/),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Language")).toHaveValue("en");
  await expect(page.getByRole("button", { name: "Food", exact: true })).toBeVisible();

  await page.getByLabel("Language").selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("button", { name: "Comida", exact: true })).toBeVisible();
});
