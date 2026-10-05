import type { Page } from "@playwright/test";
import { expect } from "./fixtures.js";

export async function send(page: Page, text: string) {
  const replies = await page.locator(".message.assistant:not(.loading)").count();
  await page.locator("#chat-input").fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.locator(".message.assistant:not(.loading)")).toHaveCount(
    replies + 1,
  );
  await expect(page.getByText("Calculando…", { exact: true })).toHaveCount(0);
}
