import { useState, type FormEvent } from "react";
import type { FoodEntry } from "@calos/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useProfile } from "../../shared/ProfileContext.js";
import { queryKeys } from "../../queries/queryKeys.js";

const meals: FoodEntry["meal"][] = ["Desayuno", "Comida", "Cena", "Snack"];

export function ManualFoodForm({
  date,
  entry,
  onSaved,
  onCancel,
}: {
  date: string;
  entry?: FoodEntry;
  onSaved: (entry: FoodEntry) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const profile = useProfile();
  const client = useQueryClient();
  const [failure, setFailure] = useState("");
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof window.calos.saveFood>[1]) =>
      window.calos.saveFood(profile.id, input),
    onSuccess: async (saved) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.days(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.foodHistory(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.undoHistory(profile.id) }),
      ]);
      onSaved(saved);
    },
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setFailure("");
    try {
      await mutation.mutateAsync({
        entryId: entry?.id ?? null,
        expected: entry ?? null,
        name: String(values.get("name")),
        quantity: String(values.get("quantity")),
        meal: String(values.get("meal")) as FoodEntry["meal"],
        date: String(values.get("date")),
        calories: Number(values.get("calories")),
        protein: Number(values.get("protein")),
        carbs: Number(values.get("carbs")),
        fat: Number(values.get("fat")),
        provider: String(values.get("provider")) as
          | "Etiqueta nutricional"
          | "Datos del usuario",
        evidence: String(values.get("evidence")),
      });
    } catch {
      setFailure(t("food.saveEntryError"));
    }
  };
  const originalSource = entry?.source;
  const originalEvidence = originalSource
    ? originalSource.provider === "USDA FoodData Central"
      ? `${originalSource.description} · FDC ${originalSource.fdcId}`
      : originalSource.evidence
    : "";

  return (
    <section className="manual-food" aria-labelledby="manual-food-title">
      <div className="manual-food-heading">
        <h2 id="manual-food-title">
          {entry ? t("food.editEntry", { name: entry.name }) : t("food.manualEntry")}
        </h2>
        <button type="button" className="waist-link" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <form className="manual-food-form" onSubmit={save}>
        <label>
          {t("food.name")}
          <input
            name="name"
            maxLength={160}
            defaultValue={entry?.name ?? ""}
            required
            autoFocus
          />
        </label>
        <div className="manual-food-grid">
          <label>
            {t("food.quantity")}
            <input
              name="quantity"
              maxLength={200}
              placeholder="150 g"
              defaultValue={entry?.quantity ?? ""}
              required
            />
          </label>
          <label>
            {t("common.date")}
            <input
              name="date"
              type="date"
              defaultValue={entry?.eatenAt.slice(0, 10) ?? date}
              required
            />
          </label>
          <label>
            {t("food.meal")}
            <select name="meal" defaultValue={entry?.meal ?? "Comida"}>
              {meals.map((meal) => (
                <option value={meal} key={meal}>
                  {meal === "Desayuno"
                    ? t("food.mealBreakfast")
                    : meal === "Comida"
                      ? t("food.mealLunch")
                      : meal === "Cena"
                        ? t("food.mealDinner")
                        : t("food.mealSnack")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{t("food.nutrients")}</legend>
          <p>{t("food.manualSourceHelp")}</p>
          <div className="manual-food-grid manual-food-nutrients">
            <label>
              {t("food.caloriesInput")}
              <input
                name="calories"
                type="number"
                min="0"
                max="100000"
                step="0.1"
                defaultValue={entry?.calories ?? ""}
                required
              />
            </label>
            <label>
              {t("food.protein")} (g)
              <input
                name="protein"
                type="number"
                min="0"
                max="10000"
                step="0.1"
                defaultValue={entry?.protein ?? ""}
                required
              />
            </label>
            <label>
              {t("food.carbs")} (g)
              <input
                name="carbs"
                type="number"
                min="0"
                max="10000"
                step="0.1"
                defaultValue={entry?.carbs ?? ""}
                required
              />
            </label>
            <label>
              {t("food.fat")} (g)
              <input
                name="fat"
                type="number"
                min="0"
                max="10000"
                step="0.1"
                defaultValue={entry?.fat ?? ""}
                required
              />
            </label>
          </div>
        </fieldset>
        <div className="manual-food-grid">
          <label>
            {t("food.source")}
            <select
              name="provider"
              defaultValue={
                originalSource?.provider === "Etiqueta nutricional"
                  ? "Etiqueta nutricional"
                  : "Datos del usuario"
              }
            >
              <option value="Datos del usuario">{t("food.sourceUser")}</option>
              <option value="Etiqueta nutricional">{t("food.sourceLabel")}</option>
            </select>
          </label>
          <label>
            {t("food.sourceEvidence")}
            <input
              name="evidence"
              maxLength={1200}
              defaultValue={originalEvidence}
              required
            />
          </label>
        </div>
        {failure && (
          <p className="waist-error" role="alert">
            {failure}
          </p>
        )}
        <div className="manual-food-actions">
          <button
            type="button"
            className="quiet-button"
            onClick={onCancel}
            disabled={mutation.isPending}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="quiet-button onboarding-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.saving") : t("food.addManual")}
          </button>
        </div>
      </form>
    </section>
  );
}
