import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { NutritionPlan } from "@calos/core";
import { useNutritionPlan, useSaveNutritionPlan } from "../../queries/plan.queries.js";

export function NutritionObjectives() {
  const { t } = useTranslation();
  const query = useNutritionPlan();
  const save = useSaveNutritionPlan();
  const [editing, setEditing] = useState<NutritionPlan | null>(null);
  const [baseline, setBaseline] = useState<NutritionPlan | null>(null);
  const [habits, setHabits] = useState("");
  const [saved, setSaved] = useState(false);
  const start = () => {
    if (!query.data) {
      return;
    }
    setEditing(structuredClone(query.data));
    setBaseline(query.data);
    setHabits(query.data.habits.join("\n"));
    setSaved(false);
    save.reset();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !baseline) {
      return;
    }
    try {
      await save.mutateAsync({
        plan: {
          ...editing,
          habits: habits
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        previous: baseline,
      });
      setEditing(null);
      setSaved(true);
    } catch {
      /* Keep edits for retry. */
    }
  };

  if (query.isPending) {
    return (
      <p className="coach-objectives" role="status">
        {t("objectives.loading")}
      </p>
    );
  }
  if (query.isError) {
    return (
      <div className="coach-objectives">
        <p role="alert">{t("objectives.loadError")}</p>
        <button className="quiet-button" onClick={() => void query.refetch()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const plan = query.data;
  return (
    <section className="coach-objectives" aria-label={t("objectives.title")}>
      <div className="coach-objectives-header">
        <div>
          <h2>{t("objectives.title")}</h2>
          <p>{plan.goal}</p>
        </div>
        {!editing && (
          <button className="quiet-button" onClick={start}>
            {t("objectives.edit")}
          </button>
        )}
      </div>
      {editing ? (
        <form onSubmit={submit} className="onboarding-fields coach-goal-form">
          <label className="onboarding-wide">
            {t("objectives.goal")}
            <input
              value={editing.goal}
              maxLength={500}
              required
              disabled={save.isPending}
              onChange={(e) => setEditing({ ...editing, goal: e.target.value })}
            />
          </label>
          {(
            [
              ["calories", t("objectives.calories"), 300, 10000],
              ["protein", t("objectives.protein"), 0, 1000],
              ["carbs", t("objectives.carbs"), 0, 2000],
              ["fat", t("objectives.fat"), 0, 1000],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                required
                min={min}
                max={max}
                step={key === "calories" ? 1 : 0.1}
                value={editing.dailyGoal[key]}
                disabled={save.isPending}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    dailyGoal: { ...editing.dailyGoal, [key]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label>
            {t("objectives.targetWeight")}
            <input
              type="number"
              min="10"
              max="500"
              step="0.1"
              value={editing.targetWeightKg ?? ""}
              disabled={save.isPending}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  targetWeightKg: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label>
            {t("objectives.targetDate")}
            <input
              type="date"
              value={editing.targetDate ?? ""}
              disabled={save.isPending}
              onChange={(e) =>
                setEditing({ ...editing, targetDate: e.target.value || null })
              }
            />
          </label>
          <label className="onboarding-wide">
            {t("objectives.habits")}
            <textarea
              rows={3}
              maxLength={2400}
              value={habits}
              disabled={save.isPending}
              onChange={(e) => setHabits(e.target.value)}
            />
          </label>
          <label className="onboarding-wide">
            {t("objectives.notes")}
            <textarea
              rows={2}
              maxLength={2000}
              value={editing.notes}
              disabled={save.isPending}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
          </label>
          <div className="onboarding-wide coach-goal-actions">
            <button
              className="quiet-button"
              type="button"
              disabled={save.isPending}
              onClick={() => setEditing(null)}
            >
              {t("common.cancel")}
            </button>
            <button
              className="quiet-button onboarding-primary"
              disabled={save.isPending}
            >
              {save.isPending ? t("objectives.saving") : t("objectives.save")}
            </button>
          </div>
          {save.isError && (
            <p className="onboarding-wide photo-error" role="alert">
              {t("objectives.saveError")}
            </p>
          )}
        </form>
      ) : (
        <>
          <p className="coach-goal-numbers">
            {plan.dailyGoal.calories} kcal · P {plan.dailyGoal.protein} g · C{" "}
            {plan.dailyGoal.carbs} g · G {plan.dailyGoal.fat} g
          </p>
          {(plan.targetWeightKg || plan.targetDate) && (
            <p>
              {plan.targetWeightKg ? `Peso objetivo: ${plan.targetWeightKg} kg. ` : ""}
              {plan.targetDate ? `Fecha orientativa: ${plan.targetDate}.` : ""}
            </p>
          )}
          {!!plan.habits.length && (
            <ul>
              {plan.habits.map((habit, index) => (
                <li key={index}>{habit}</li>
              ))}
            </ul>
          )}
          {plan.notes && <p>{plan.notes}</p>}
          {saved && <p role="status">{t("objectives.saved")}</p>}
        </>
      )}
    </section>
  );
}
