import { useState, type FormEvent } from "react";
import type { UserProfileInput } from "@calos/core";

export function ProfileOnboarding({
  onSave,
  onCancel,
  busy,
  error,
}: {
  onSave: (input: UserProfileInput) => Promise<unknown>;
  onCancel?: () => void;
  busy: boolean;
  error: boolean;
}) {
  const [step, setStep] = useState(1);
  const [values, setValues] = useState({
    name: "",
    age: "",
    heightCm: "",
    weightKg: "",
    goal: "Mantener mi peso",
    activity: "moderate",
    dietaryPreferences: "",
    assistantInstructions: "",
    dailyCalories: "2200",
    dailyProtein: "140",
    dailyCarbs: "250",
    dailyFat: "70",
    targetWeightKg: "",
    targetDate: "",
    habits: "",
  });
  const change = (field: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    try {
      await onSave({
        ...values,
        age: Number(values.age),
        heightCm: Number(values.heightCm),
        weightKg: Number(values.weightKg.replace(",", ".")),
        dailyCalories: Number(values.dailyCalories),
        dailyProtein: Number(values.dailyProtein),
        dailyCarbs: Number(values.dailyCarbs),
        dailyFat: Number(values.dailyFat),
        targetWeightKg: values.targetWeightKg ? Number(values.targetWeightKg) : null,
        targetDate: values.targetDate || null,
        habits: values.habits
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        activity: values.activity as UserProfileInput["activity"],
      });
    } catch {
      // The mutation error is shown below without discarding the form.
    }
  };
  return (
    <main className="onboarding-shell">
      <section className="onboarding" aria-labelledby="onboarding-title">
        <div className="onboarding-brand">
          <img src="./branding/calos-icon.svg" alt="" width="44" height="44" />
          <span>calos</span>
        </div>
        <p className="onboarding-progress">Paso {step} de 2</p>
        <h1 id="onboarding-title">
          {step === 1 ? "Crea tu perfil" : "Hazlo a tu manera"}
        </h1>
        <p className="onboarding-intro">
          {step === 1
            ? "Tu diario, tus medidas y tu conversación tendrán su propio espacio en este equipo."
            : "Estas preferencias ayudan al asistente a adaptar sus preguntas y explicaciones a ti."}
        </p>
        <form onSubmit={submit}>
          {step === 1 ? (
            <div className="onboarding-fields">
              <label>
                Nombre
                <input
                  value={values.name}
                  onChange={(event) => change("name", event.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                  disabled={busy}
                />
              </label>
              <label>
                Edad
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={values.age}
                  onChange={(event) => change("age", event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Altura (cm)
                <input
                  type="number"
                  min="50"
                  max="250"
                  value={values.heightCm}
                  onChange={(event) => change("heightCm", event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label>
                Peso actual (kg)
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="0.1"
                  value={values.weightKg}
                  onChange={(event) => change("weightKg", event.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="onboarding-wide">
                Tu objetivo
                <input
                  value={values.goal}
                  onChange={(event) => change("goal", event.target.value)}
                  maxLength={500}
                  required
                  disabled={busy}
                />
              </label>
              <label className="onboarding-wide">
                Actividad habitual
                <select
                  value={values.activity}
                  onChange={(event) => change("activity", event.target.value)}
                  disabled={busy}
                >
                  <option value="low">Poco movimiento o trabajo sentado</option>
                  <option value="moderate">Actividad moderada</option>
                  <option value="high">Entrenamiento frecuente o trabajo activo</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="onboarding-fields">
              <label className="onboarding-wide">
                Objetivo diario (kcal)
                <input
                  type="number"
                  min="300"
                  max="10000"
                  value={values.dailyCalories}
                  onChange={(event) => change("dailyCalories", event.target.value)}
                  required
                  disabled={busy}
                />
                <small>
                  Puedes indicar el objetivo que ya sigues. 2200 es un valor inicial, no
                  una recomendación personalizada.
                </small>
              </label>
              {(
                [
                  ["dailyProtein", "Proteína diaria (g)", 1000],
                  ["dailyCarbs", "Carbohidratos diarios (g)", 2000],
                  ["dailyFat", "Grasas diarias (g)", 1000],
                ] as const
              ).map(([field, label, max]) => (
                <label key={field}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    max={max}
                    step="0.1"
                    value={values[field]}
                    onChange={(event) => change(field, event.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
              ))}
              <p className="onboarding-wide onboarding-hint">
                Puedes revisar estos valores con el asistente. Los valores iniciales no
                se han calculado a partir de tus datos.
              </p>
              <label>
                Peso objetivo (kg, opcional)
                <input
                  type="number"
                  min="10"
                  max="500"
                  step="0.1"
                  value={values.targetWeightKg}
                  onChange={(event) => change("targetWeightKg", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Fecha orientativa (opcional)
                <input
                  type="date"
                  value={values.targetDate}
                  onChange={(event) => change("targetDate", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="onboarding-wide">
                Hábitos que quieres trabajar (opcional)
                <textarea
                  value={values.habits}
                  onChange={(event) => change("habits", event.target.value)}
                  rows={2}
                  maxLength={2400}
                  placeholder="Un hábito por línea: preparar comidas, añadir verduras…"
                  disabled={busy}
                />
              </label>
              <label className="onboarding-wide">
                Preferencias alimentarias (opcional)
                <textarea
                  value={values.dietaryPreferences}
                  onChange={(event) => change("dietaryPreferences", event.target.value)}
                  placeholder="Por ejemplo: vegetariano, sin lactosa o alimentos que evitas"
                  maxLength={1000}
                  rows={3}
                  disabled={busy}
                />
              </label>
              <label className="onboarding-wide">
                Cómo quieres que te acompañe (opcional)
                <textarea
                  value={values.assistantInstructions}
                  onChange={(event) =>
                    change("assistantInstructions", event.target.value)
                  }
                  placeholder="Por ejemplo: respuestas breves, sin juicios y preguntas de una en una"
                  maxLength={2000}
                  rows={3}
                  disabled={busy}
                />
              </label>
            </div>
          )}
          {error && (
            <p className="waist-error" role="alert">
              No se ha podido crear el perfil. Revisa los datos e inténtalo de nuevo.
            </p>
          )}
          <div className="onboarding-actions">
            {step === 2 ? (
              <button
                type="button"
                className="quiet-button"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                Atrás
              </button>
            ) : (
              onCancel && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Cancelar
                </button>
              )
            )}
            <button
              className="quiet-button onboarding-primary"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Creando perfil…"
                : step === 1
                  ? "Continuar"
                  : "Empezar mi diario"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
