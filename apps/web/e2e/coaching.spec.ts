import { test, expect } from "./fixtures.js";
import { send } from "./chat.js";
import { createProfile, profileProposal } from "./onboarding.js";
const route = {
  name: "meal_interpretation",
  content: { action: "coach", foods: [], clarification: null },
};

const changedFields = [
  "goal",
  "calories",
  "protein",
  "carbs",
  "fat",
  "targetWeightKg",
  "targetDate",
  "habits",
  "notes",
];

const proposal = {
  goal: "Mejorar mis hábitos y perder peso gradualmente",
  dailyGoal: { calories: 2000, protein: 150, carbs: 220, fat: 65 },
  targetWeightKg: 75,
  targetDate: null,
  habits: ["Añadir verduras a la comida"],
  notes: "Revisar la evolución semanal, sin valorar un peso aislado.",
};

test("objetivos: editar, actualizar el diario y conservarlos al reiniciar", async ({
  webApp,
}, testInfo) => {
  const page = webApp.page;
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  const section = page.getByRole("region", { name: "Tus objetivos nutricionales" });
  await section.getByRole("button", { name: "Editar objetivos" }).click();
  await section
    .getByLabel("Objetivo", { exact: true })
    .fill("Comer mejor y mantener mi peso");
  await section.getByLabel("Calorías diarias (kcal)").fill("1900");
  await section.getByLabel("Proteína diaria (g)").fill("120");
  await section.getByLabel("Carbohidratos diarios (g)").fill("230");
  await section.getByLabel("Grasas diarias (g)").fill("60");
  await section
    .getByLabel("Hábitos (uno por línea)")
    .fill("Preparar la cena con antelación\nAñadir verduras");
  await section.getByRole("button", { name: "Guardar objetivos" }).click();
  await expect(section.getByRole("status")).toHaveText("Objetivos guardados.");
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("assistant-objectives.png") });
  const snapshot = await webApp.snapshot();
  expect(snapshot.dailyGoal).toEqual({
    calories: 1900,
    protein: 120,
    carbs: 230,
    fat: 60,
  });
  expect(snapshot.profile?.goal).toBe("Comer mejor y mantener mi peso");
  expect(snapshot.objectives?.habits).toHaveLength(2);
  await page.getByRole("button", { name: "Comida", exact: true }).click();
  await expect(page.locator(".calorie-panel")).toContainText("1900");
  await expect(page.locator(".macro").filter({ hasText: "Proteína" })).toContainText(
    "120 g",
  );
  await webApp.restart();
  expect((await webApp.snapshot()).objectives).toEqual(snapshot.objectives);
});

test("acompañamiento: aconsejar con contexto del onboarding sin escribir comidas ni objetivos", async ({
  webApp,
}) => {
  const page = webApp.page;
  await page.getByRole("button", { name: "Peso", exact: true }).click();
  const panel = page.getByRole("region", { name: "Medidas de peso" });
  await panel.getByLabel("Peso (kg)", { exact: true }).fill("79");
  await panel.getByRole("button", { name: "Guardar medida", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Medida guardada.");
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: {
        message:
          "Solo hay un peso registrado. Podemos empezar preparando una cena equilibrada y revisar más registros antes de valorar una tendencia.",
        proposal: null,
      },
    },
  ]);
  await send(page, "Quiero comer mejor, ¿cómo empiezo?");
  expect((await webApp.snapshot()).entries).toEqual([]);
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(2200);
  const request = (await webApp.requests())[1];
  expect(request.messages[0].content).toContain("79");
  expect(request.messages[0].content).toContain("35");
  const context = JSON.parse(request.messages[1].content);
  expect(context.currentPlan.dailyGoal.protein).toBe(140);
  expect(context.weightMeasurements).toHaveLength(1);
  expect(context.recordedDays).toEqual([]);
  expect(context.reviewWindow.loggedDays).toBe(0);
  await expect(
    page.getByRole("region", { name: "Propuesta de objetivos" }),
  ).toHaveCount(0);
});

test("acompañamiento: continuar una propuesta y aplicarla solo al aceptar", async ({
  webApp,
}) => {
  const page = webApp.page;
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: {
        message:
          "Te propongo empezar por 2000 kcal y añadir verduras; puedes ajustar el borrador antes de aplicarlo.",
        proposal,
        changedFields,
      },
    },
  ]);
  await send(page, "Ayúdame a fijar objetivos de 2000 kcal y 150 g de proteína");
  const card = page.getByRole("region", { name: "Propuesta de objetivos" });
  await expect(card).toContainText("2000 kcal");
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(2200);
  const revised = { ...proposal, dailyGoal: { ...proposal.dailyGoal, protein: 160 } };
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: {
        message: "La propuesta mantiene el resto y pasa a 160 g de proteína.",
        proposal: { ...revised, targetWeightKg: null, habits: [], notes: "" },
        changedFields: ["protein"],
      },
    },
  ]);
  await send(page, "Prefiero 160 g de proteína, conserva el resto");
  const context = JSON.parse((await webApp.requests())[3].messages[1].content);
  expect(context.previousProposal).toEqual(proposal);
  await card.getByRole("button", { name: "Aplicar objetivos" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".message.assistant").last()).toContainText(
    "He actualizado tus objetivos",
  );
  const snapshot = await webApp.snapshot();
  expect(snapshot.dailyGoal).toEqual(revised.dailyGoal);
  expect(snapshot.objectives?.targetWeightKg).toBe(75);
  expect(snapshot.entries).toEqual([]);
  await webApp.restart();
  expect((await webApp.snapshot()).dailyGoal).toEqual(revised.dailyGoal);
});

test("propuesta: descartar y cambiar de perfil no guarda ni comparte objetivos", async ({
  webApp,
}) => {
  const page = webApp.page;
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: { message: "Una propuesta para revisar.", proposal, changedFields },
    },
  ]);
  await send(page, "Quiero revisar mi objetivo");
  await page.getByRole("button", { name: "Descartar propuesta" }).click();
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(2200);
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: { message: "Otra propuesta para revisar.", proposal, changedFields },
    },
  ]);
  await send(page, "Vuelve a proponerme un plan");
  await page.getByRole("button", { name: "Nuevo perfil" }).click();
  await createProfile(page, "Luis", "", "2400");
  await expect(page.getByRole("button", { name: "Aplicar objetivos" })).toHaveCount(0);
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(2400);
  expect((await webApp.snapshot("Perfil de prueba")).dailyGoal.calories).toBe(2200);
});

test("propuesta: rechazar un plan obsoleto y una respuesta inválida", async ({
  webApp,
}) => {
  const page = webApp.page;
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: { message: "Revisa esta propuesta.", proposal, changedFields },
    },
  ]);
  await send(page, "Propón objetivos");
  const section = page.getByRole("region", { name: "Tus objetivos nutricionales" });
  await section.getByRole("button", { name: "Editar objetivos" }).click();
  await section.getByLabel("Calorías diarias (kcal)").fill("1800");
  await section.getByRole("button", { name: "Guardar objetivos" }).click();
  await expect(section.getByRole("status")).toHaveText("Objetivos guardados.");
  await page.getByRole("button", { name: "Aplicar objetivos" }).click();
  await expect(
    page.getByRole("region", { name: "Propuesta de objetivos" }).getByRole("alert"),
  ).toBeVisible();
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(1800);
  await webApp.mock([route]);
  await send(page, "Sobre esa propuesta, cambia solo la proteína a 160 g");
  await expect(page.locator(".message.assistant").last()).toContainText(
    "Tus objetivos han cambiado",
  );
  await expect(page.getByRole("button", { name: "Aplicar objetivos" })).toHaveCount(0);
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(1800);

  await webApp.mock([
    route,
    {
      name: "nutrition_coaching",
      content: {
        message: "Plan inválido",
        proposal: { ...proposal, dailyGoal: { ...proposal.dailyGoal, protein: -10 } },
      },
    },
  ]);
  await send(page, "Propón otro objetivo");
  expect((await webApp.snapshot()).dailyGoal.calories).toBe(1800);
  await expect(page.getByRole("button", { name: "Aplicar objetivos" })).toHaveCount(0);
});

test.describe("onboarding de objetivos", () => {
  test.use({ autoOnboard: false });
  test("guardar macros, hábitos y peso objetivo junto al perfil", async ({
    webApp,
  }) => {
    const page = webApp.page;
    await webApp.mock([
      {
        name: "profile_onboarding",
        content: {
          message: "Te propongo 1900 kcal y estos macros como punto de partida.",
          profile: {
            ...profileProposal("Ana", "", "1900"),
            age: 40,
            heightCm: 165,
            weightKg: 70,
            goal: "Mejorar mi composición corporal",
            dailyProtein: 110,
            dailyCarbs: 210,
            dailyFat: 65,
            targetWeightKg: 68,
            habits: ["Cocinar más en casa"],
            dietaryPreferences: "Vegetariana",
          },
        },
      },
    ]);
    await page
      .getByLabel("Tu mensaje", { exact: true })
      .fill(
        "Soy Ana, tengo 40 años, mido 165 cm y peso 70 kg. Soy mujer, tengo actividad moderada y quiero mejorar mi composición corporal y llegar a 68 kg. Soy vegetariana y quiero cocinar más en casa.",
      );
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await page.getByRole("button", { name: "Aplicar objetivos y empezar" }).click();
    await expect(
      page.getByRole("heading", { name: "Tu día, de un vistazo." }),
    ).toBeVisible();
    const snapshot = await webApp.snapshot();
    expect(snapshot.dailyGoal.protein).toBe(110);
    expect(snapshot.objectives).toMatchObject({
      goal: "Mejorar mi composición corporal",
      targetWeightKg: 68,
      habits: ["Cocinar más en casa"],
    });
    await webApp.mock([
      route,
      {
        name: "nutrition_coaching",
        content: {
          message:
            "Podemos mantener tu preferencia vegetariana y priorizar recetas caseras.",
          proposal: null,
        },
      },
    ]);
    await send(page, "Dame consejos para seguir mi objetivo");
    const request = (await webApp.requests())[1];
    expect(request.messages[0].content).toContain("Vegetariana");
    expect(JSON.parse(request.messages[1].content).currentPlan.targetWeightKg).toBe(68);
  });
});
