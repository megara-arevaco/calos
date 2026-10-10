import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FoodTemplate } from "@calos/core";
import { scaleRecipeEntry } from "../../../../../packages/core/src/nutrition/recipes.js";

export function RecipeEditor({
  template,
  saving,
  onSave,
  onCancel,
}: {
  template: FoodTemplate;
  saving: boolean;
  onSave: (template: FoodTemplate, expected: FoodTemplate) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState(
    template.entries.map((entry) => ({ entry, factor: 1 })),
  );
  const [failure, setFailure] = useState("");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updated: FoodTemplate = {
      ...template,
      name: String(data.get("recipeName")).trim(),
      baseServings: Number(data.get("baseServings")),
      entries: items.map(({ entry, factor }) => scaleRecipeEntry(entry, factor)),
    };
    setFailure("");
    try {
      await onSave(updated, template);
    } catch {
      setFailure(t("food.recipeEditError"));
    }
  };

  return (
    <section className="recipe-editor" aria-labelledby="recipe-editor-title">
      <div className="manual-food-heading">
        <h3 id="recipe-editor-title">
          {t("food.editRecipe", { name: template.name })}
        </h3>
        <button type="button" className="waist-link" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
      <p className="waist-help">{t("food.recipeEditHelp")}</p>
      <form className="recipe-editor-form" onSubmit={(event) => void save(event)}>
        <div className="manual-food-grid">
          <label>
            {t("food.recipeName")}
            <input
              name="recipeName"
              maxLength={80}
              defaultValue={template.name}
              required
            />
          </label>
          <label>
            {t("food.baseServings")}
            <input
              name="baseServings"
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              defaultValue={template.baseServings}
              required
            />
          </label>
        </div>
        <div className="recipe-components">
          {items.map(({ entry, factor }, index) => (
            <fieldset className="recipe-component" key={`${entry.name}-${index}`}>
              <legend>{entry.name}</legend>
              <p>
                {entry.quantity} · {entry.calories} kcal ·{" "}
                {entry.source?.provider ?? t("food.sourceUser")}
                {entry.source?.provider === "Estimación" &&
                  ` · ${t("food.estimatedValues")}`}
                {entry.source?.provider === "Datos del usuario" &&
                  Object.values(entry.source.ranges).some(
                    (range) => range.min !== range.max,
                  ) &&
                  ` · ${t("food.rangeMidpoint")}`}
              </p>
              <label>
                {t("food.recipeComponentFactor", { name: entry.name })}
                <input
                  type="number"
                  min="0.01"
                  max="1000"
                  step="0.01"
                  value={factor}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setItems((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, factor: next } : item,
                      ),
                    );
                  }}
                  required
                />
              </label>
              {items.length > 1 && (
                <button
                  type="button"
                  className="waist-link"
                  onClick={() =>
                    setItems((current) => current.filter((_, i) => i !== index))
                  }
                >
                  {t("food.removeRecipeComponent", { name: entry.name })}
                </button>
              )}
            </fieldset>
          ))}
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
            disabled={saving}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="quiet-button onboarding-primary"
            disabled={saving || !items.length}
          >
            {saving ? t("common.saving") : t("food.saveRecipe")}
          </button>
        </div>
      </form>
    </section>
  );
}
