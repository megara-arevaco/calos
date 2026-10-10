import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";

test.use({ autoOnboard: false });

async function onboardingCall(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/rpc/profiles:onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["Ayúdame a crear un perfil", []]),
    });
    return { status: response.status, body: await response.json() };
  });
}

async function usage(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/rpc/assistant:usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    return (await response.json()).data;
  });
}

async function createManualProfile(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Crear perfil manualmente" }).click();
  const form = page.locator(".manual-profile-form");
  await form.getByLabel("Nombre", { exact: true }).fill("Perfil cuota");
  await form.getByLabel("Edad", { exact: true }).fill("35");
  await form.getByLabel("Altura (cm)", { exact: true }).fill("170");
  await form.getByLabel("Peso (kg)", { exact: true }).fill("70");
  await form
    .getByLabel("Objetivo que quieres anotar", { exact: true })
    .fill("Registro temporal");
  await form.getByLabel("Calorías (kcal)", { exact: true }).fill("2000");
  await form.getByLabel("Proteína (g)", { exact: true }).fill("100");
  await form.getByLabel("Carbohidratos (g)", { exact: true }).fill("200");
  await form.getByLabel("Grasas (g)", { exact: true }).fill("70");
  await form
    .getByRole("button", { name: "Crear perfil manualmente", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu día, de un vistazo." }),
  ).toBeVisible();
}

test("onboarding concurrente reserva antes de enviar y comparte el límite persistente de solicitudes", async ({
  webApp,
}) => {
  await webApp.close();
  await webApp.launch("e2e-fake-key", {
    maxRequests: 1,
    maxTokens: 100_000,
    periodHours: 24,
  });
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: { message: "¿Qué nombre prefieres?", profile: null },
    },
  ]);
  const [first, second] = await Promise.all([
    onboardingCall(webApp.page),
    onboardingCall(webApp.page),
  ]);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(
    [first.body.data.error === true, second.body.data.error === true].filter(Boolean),
  ).toHaveLength(1);
  expect(await webApp.requests(true)).toHaveLength(1);
  let status = await usage(webApp.page);
  expect(status).toMatchObject({
    requestsReserved: 1,
    requestLimit: 1,
    tokenLimit: 100_000,
  });
  expect(status.tokensReserved).toBeGreaterThan(4_000);

  await webApp.restart();
  status = await usage(webApp.page);
  expect(status).toMatchObject({ requestsReserved: 1, requestLimit: 1 });
  expect(await webApp.requests(true)).toEqual([]);
});

test("los fallos y reintentos gastan reservas persistentes y las carreras concurrentes no exceden la cuota", async ({
  webApp,
}) => {
  await webApp.close();
  await webApp.launch("e2e-fake-key", {
    maxRequests: 2,
    maxTokens: 100_000,
    periodHours: 24,
  });
  await webApp.mock([{ name: "profile_onboarding", status: 503 }]);
  const failed = await onboardingCall(webApp.page);
  expect(failed.status).toBe(200);
  expect(failed.body.data.error).toBe(true);
  expect((await usage(webApp.page)).requestsReserved).toBe(1);

  await webApp.restart();
  expect((await usage(webApp.page)).requestsReserved).toBe(1);
  await webApp.mock([
    {
      name: "profile_onboarding",
      content: { message: "¿Qué nombre prefieres?", profile: null },
    },
  ]);
  const retried = await onboardingCall(webApp.page);
  expect(retried.body.data.error).toBeUndefined();
  expect((await usage(webApp.page)).requestsReserved).toBe(2);

  const blocked = await Promise.all([
    onboardingCall(webApp.page),
    onboardingCall(webApp.page),
  ]);
  expect(blocked.every((item) => item.body.data.error === true)).toBe(true);
  expect(await webApp.requests(true)).toHaveLength(1);
  expect((await usage(webApp.page)).requestsReserved).toBe(2);
});

test("una foto con varios pasos se reserva por llamada, agota tokens antes del segundo envío y deja la entrada manual disponible", async ({
  webApp,
}) => {
  await webApp.close();
  await webApp.launch("e2e-fake-key", {
    maxRequests: 10,
    maxTokens: 40_000,
    periodHours: 24,
  });
  await createManualProfile(webApp.page);
  const plateDraft = {
    dishName: "Pollo asado",
    meal: "Cena",
    foods: [
      {
        name: "Pollo asado",
        grams: 180,
        quantityOrigin: "visual",
        queries: ["chicken breast meat cooked roasted"],
      },
    ],
    assumptions: ["Peso aproximado inferido de la foto."],
    questions: [],
  };
  await webApp.page.getByLabel("Foto de plato", { exact: true }).setInputFiles({
    name: "plato.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await webApp.mock([
    {
      name: "plate_interpretation",
      content: { intent: "record", message: "Borrador listo.", draft: plateDraft },
    },
  ]);
  await send(webApp.page, "Registra este plato");
  await expect(webApp.page.locator(".message.assistant").last()).toContainText(
    "reserva estimada",
  );
  expect((await webApp.snapshot()).entries).toEqual([]);
  const requests = await webApp.requests();
  expect(requests).toHaveLength(1);
  const userContent = requests[0]!.messages[1]!.content as unknown;
  expect(
    Array.isArray(userContent) &&
      userContent.some((part) => (part as { type: string }).type === "image_url"),
  ).toBe(true);
  const status = await usage(webApp.page);
  expect(status).toMatchObject({
    requestsReserved: 1,
    requestLimit: 10,
    tokenLimit: 40_000,
  });
  expect(status.tokensReserved).toBeGreaterThan(20_000);
  expect(status.tokensReserved).toBeLessThan(status.tokenLimit);
  await webApp.page
    .getByRole("button", { name: "Continuar con registro manual" })
    .click();
  await webApp.page.getByRole("button", { name: "Registrar comida" }).click();
  await expect(webApp.page.locator(".manual-food-form")).toBeVisible();
});
