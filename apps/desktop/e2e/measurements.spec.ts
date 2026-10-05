import { test, expect } from "./fixtures.js";

for (const kind of [
  {
    tab: "Peso",
    region: "Medidas de peso",
    label: "Peso (kg)",
    value: "99,5",
    updated: "98,2",
    unit: "kg",
    max: 500,
    key: "weightMeasurements",
    field: "kilograms",
  },
  {
    tab: "Cintura",
    region: "Medidas de cintura",
    label: "Contorno (cm)",
    value: "82,5",
    updated: "81,2",
    unit: "cm",
    max: 300,
    key: "waistMeasurements",
    field: "centimeters",
  },
] as const) {
  test(`${kind.tab}: crear, editar, reiniciar y eliminar una medida`, async ({
    desktop,
  }) => {
    let page = desktop.page;
    await page.getByRole("button", { name: kind.tab, exact: true }).click();
    let panel = page.getByRole("region", { name: kind.region });
    await expect(
      panel.getByText("Guarda tu primera medida para empezar a ver la evolución."),
    ).toBeVisible();
    await panel.getByLabel("Fecha", { exact: true }).fill("2026-01-02");
    await panel.getByLabel(kind.label, { exact: true }).fill(kind.value);
    await panel.getByRole("button", { name: "Guardar medida", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Medida guardada.");
    const original = (await desktop.snapshot())[kind.key][0];
    await panel.getByRole("button", { name: /Editar medida del/ }).click();
    await expect(panel.getByLabel(kind.label, { exact: true })).toHaveValue(kind.value);
    await panel.getByLabel(kind.label, { exact: true }).fill(kind.updated);
    await panel.getByRole("button", { name: "Actualizar medida" }).click();
    await expect(panel.getByRole("status")).toHaveText("Medida actualizada.");
    const saved = (await desktop.snapshot())[kind.key];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: original.id,
      [kind.field]: Number(kind.updated.replace(",", ".")),
    });
    await desktop.restart();
    page = desktop.page;
    await page.getByRole("button", { name: kind.tab, exact: true }).click();
    panel = page.getByRole("region", { name: kind.region });
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem")).toContainText(
      `${kind.updated} ${kind.unit}`,
    );
    await panel.getByRole("button", { name: /Eliminar medida del/ }).click();
    await expect(panel.getByRole("status")).toHaveText("Medida eliminada.");
    expect((await desktop.snapshot())[kind.key]).toEqual([]);
    await desktop.restart();
    await desktop.page.getByRole("button", { name: kind.tab, exact: true }).click();
    await expect(
      desktop.page.getByRole("region", { name: kind.region }).getByRole("listitem"),
    ).toHaveCount(0);
  });

  test(`${kind.tab}: rechazar valores inválidos y ordenar la evolución por fecha`, async ({
    desktop,
  }) => {
    const page = desktop.page;
    await page.getByRole("button", { name: kind.tab, exact: true }).click();
    const panel = page.getByRole("region", { name: kind.region });

    for (const value of ["abc", "0", String(kind.max + 1)]) {
      await panel.getByLabel(kind.label, { exact: true }).fill(value);
      await panel.getByRole("button", { name: "Guardar medida", exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText(
        `Introduce una medida entre 0,1 y ${kind.max} ${kind.unit}.`,
      );
      await expect(panel.getByRole("listitem")).toHaveCount(0);
    }
    for (const [date, value] of [
      ["2026-01-03", "80"],
      ["2026-01-01", "82"],
    ]) {
      await panel.getByLabel("Fecha", { exact: true }).fill(date);
      await panel.getByLabel(kind.label, { exact: true }).fill(value);
      await panel.getByRole("button", { name: "Guardar medida", exact: true }).click();
      await expect(panel.getByRole("status")).toHaveText("Medida guardada.");
    }
    await expect(panel.getByRole("listitem")).toHaveCount(2);
    await expect(panel.getByRole("listitem").first()).toContainText(`80 ${kind.unit}`);
    await expect(panel.getByText(new RegExp(`-2 ${kind.unit} desde el`))).toBeVisible();
    const chart = panel.getByRole("group");
    await chart.getByRole("button", { name: new RegExp(`: 82 ${kind.unit}$`) }).focus();
    await desktop.page.keyboard.press("Enter");
    await expect(
      chart.getByRole("button", { name: new RegExp(`: 82 ${kind.unit}$`) }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator(".chart-heading")).toContainText(`82 ${kind.unit}`);
    expect((await desktop.snapshot())[kind.key]).toHaveLength(2);
  });
}
