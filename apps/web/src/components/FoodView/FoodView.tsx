import type { DaySummary, FoodHistoryDay } from "@calos/core";
import type { AppView } from "../App/App.hook.js";
import type { FoodEntry } from "@calos/core";
import { FoodHistory } from "../FoodHistory/index.js";
import { today, formatDate } from "../../shared/presentation.js";
import { FireIcon, ForkKnifeIcon, PlusIcon, TrashIcon } from "../../shared/icons.js";
function Macro({
  name,
  amount,
  target,
  unit,
  color,
}: {
  name: string;
  amount: number;
  target: number;
  unit: string;
  color: string;
}) {
  const percent = Math.min(100, Math.round((amount / target) * 100));
  return (
    <div className="macro">
      <div className="macro-head">
        <span>{name}</span>
        <strong>
          {amount}
          <small>{unit}</small>
        </strong>
      </div>
      <div className="track">
        <i style={{ width: `${percent}%`, background: color }} />
      </div>
      <span className="macro-target">
        de {target}
        {unit}
      </span>
    </div>
  );
}

function mealIcon(meal: FoodEntry["meal"]) {
  return meal === "Desayuno"
    ? "☼"
    : meal === "Comida"
      ? "◒"
      : meal === "Cena"
        ? "◐"
        : "·";
}

interface FoodViewProps {
  view: AppView;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  summary: DaySummary;
  days: FoodHistoryDay[];
  groups: { meal: FoodEntry["meal"]; entries: FoodEntry[] }[];
  remaining: number;
  ring: number;
  diaryLoading: boolean;
  diaryError: string;
  refresh: () => Promise<unknown>;
  remove: (id: string) => Promise<void>;
}

export function FoodView({
  view,
  selectedDate,
  setSelectedDate,
  summary,
  days,
  groups,
  remaining,
  ring,
  diaryLoading,
  diaryError,
  refresh,
  remove,
}: FoodViewProps) {
  return (
    <section
      className="content"
      id="comida-panel"
      hidden={view !== "comida"}
      aria-label="Comida"
    >
      <header>
        <div>
          <p className="date">{formatDate(selectedDate)}</p>
          <h1>
            {selectedDate === today()
              ? "Tu día, de un vistazo."
              : "Tu diario de comidas."}
          </h1>
        </div>
        <button
          className="quiet-button"
          onClick={() => {
            setSelectedDate(today());
            document.getElementById("chat-input")?.focus();
          }}
        >
          <PlusIcon weight="bold" /> Registrar comida
        </button>
      </header>
      <div className="diary-date-picker">
        <label htmlFor="diary-date">Consultar fecha</label>
        <input
          id="diary-date"
          type="date"
          value={selectedDate}
          max={today()}
          onChange={(event) => {
            if (event.target.value) {
              setSelectedDate(event.target.value);
            }
          }}
        />
        <button
          type="button"
          className="quiet-button"
          disabled={selectedDate === today()}
          onClick={() => setSelectedDate(today())}
        >
          Hoy
        </button>
      </div>
      {selectedDate !== today() && (
        <p className="waist-help">
          El chat registra las nuevas comidas en el día de hoy.
        </p>
      )}
      {diaryError && (
        <p className="waist-error" role="alert">
          {diaryError}{" "}
          <button type="button" className="waist-link" onClick={() => void refresh()}>
            Reintentar
          </button>
        </p>
      )}
      {diaryLoading ? (
        <p className="waist-help" role="status">
          Cargando diario…
        </p>
      ) : (
        !diaryError && (
          <>
            <div className="dashboard">
              <section className="calorie-panel">
                <div>
                  <p className="section-label">
                    {selectedDate === today() ? "Energía de hoy" : "Energía del día"}
                  </p>
                  <div className="calorie-copy">
                    <strong>{summary.total.calories.toLocaleString("es-ES")}</strong>
                    <span>kcal consumidas</span>
                  </div>
                  <p className="remaining">
                    <FireIcon weight="fill" />{" "}
                    {selectedDate === today() ? "Te quedan " : "Hasta el objetivo: "}
                    <b>{remaining.toLocaleString("es-ES")} kcal</b>
                  </p>
                </div>
                <div
                  className="calorie-ring"
                  style={{ "--progress": `${ring * 3.6}deg` } as React.CSSProperties}
                >
                  <div>
                    <b>{Math.round(ring)}%</b>
                    <span>
                      de {summary.dailyGoal.calories.toLocaleString("es-ES")} kcal
                    </span>
                  </div>
                </div>
              </section>
              <section className="macro-panel">
                <p className="section-label">Macronutrientes</p>
                <Macro
                  name="Proteína"
                  amount={summary.total.protein}
                  target={summary.dailyGoal.protein}
                  unit=" g"
                  color="oklch(0.48 0.13 140)"
                />
                <Macro
                  name="Carbohidratos"
                  amount={summary.total.carbs}
                  target={summary.dailyGoal.carbs}
                  unit=" g"
                  color="oklch(0.63 0.15 80)"
                />
                <Macro
                  name="Grasas"
                  amount={summary.total.fat}
                  target={summary.dailyGoal.fat}
                  unit=" g"
                  color="oklch(0.53 0.15 20)"
                />
              </section>
            </div>
            <section className="diary">
              <div className="diary-title">
                <div>
                  <p className="section-label">Diario</p>
                  <h2>Lo que has comido</h2>
                </div>
                <span>
                  {summary.entries.length}{" "}
                  {summary.entries.length === 1 ? "registro" : "registros"}
                </span>
              </div>
              {groups.length ? (
                groups.map((group) => (
                  <div className="meal-group" key={group.meal}>
                    <h3>
                      <i>{mealIcon(group.meal)}</i>
                      {group.meal}
                    </h3>
                    {group.entries.map((entry) => (
                      <article className="food-row" key={entry.id}>
                        <div>
                          <strong>{entry.name}</strong>
                          <span>
                            {entry.quantity} · P {entry.protein}g · C {entry.carbs}g · G{" "}
                            {entry.fat}g
                          </span>
                          {entry.source?.volumeEstimate && (
                            <p className="food-estimate-note">
                              Valores aproximados · conversión de ml a gramos (
                              {entry.source.volumeEstimate.gramsPerMilliliter} g/ml).{" "}
                              {entry.source.volumeEstimate.assumption}
                            </p>
                          )}
                          {entry.source?.photoEstimate && (
                            <p className="food-estimate-note">
                              Foto de plato · composición
                              {entry.source.photoEstimate.estimatedGrams
                                ? " y cantidades"
                                : ""}{" "}
                              aproximada
                              {entry.source.photoEstimate.estimatedGrams ? "s" : ""}
                            </p>
                          )}
                          {entry.source?.provider === "Estimación" && (
                            <p className="food-estimate-note">
                              Valores aproximados · estimación del asistente
                            </p>
                          )}
                          {entry.source && (
                            <details className="food-source">
                              <summary>
                                {entry.source.provider === "USDA FoodData Central"
                                  ? "Referencia USDA"
                                  : entry.source.provider === "Datos del usuario"
                                    ? "Datos del usuario"
                                    : entry.source.provider === "Estimación"
                                      ? "Estimación aproximada"
                                      : "Etiqueta de la foto"}
                              </summary>
                              {entry.source.provider === "USDA FoodData Central" ? (
                                <>
                                  <p>{entry.source.description}</p>
                                  <p>
                                    SR Legacy · FDC {entry.source.fdcId} ·{" "}
                                    {entry.source.grams.toLocaleString("es-ES", {
                                      maximumFractionDigits: 1,
                                    })}{" "}
                                    g
                                    {entry.source.portion
                                      ? ` · Ración: ${entry.source.portion}`
                                      : ""}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p>{entry.source.evidence}</p>
                                  {entry.source.provider === "Estimación" && (
                                    <>
                                      <p>
                                        No hay una receta o referencia exacta.
                                        Suposiciones usadas:
                                      </p>
                                      <ul>
                                        {entry.source.assumptions.map(
                                          (assumption, index) => (
                                            <li key={index}>{assumption}</li>
                                          ),
                                        )}
                                      </ul>
                                    </>
                                  )}
                                  {entry.source.provider === "Datos del usuario" &&
                                    Object.values(entry.source.ranges).some(
                                      (range) => range.min !== range.max,
                                    ) && (
                                      <p>
                                        Estimación con el punto medio de los rangos
                                        indicados.
                                      </p>
                                    )}
                                  <p>
                                    Valores por{" "}
                                    {entry.source.basis === "serving"
                                      ? "ración"
                                      : entry.source.basis === "100ml"
                                        ? "100 ml"
                                        : "100 g"}
                                    :{" "}
                                    {entry.source.perBasis.calories.toLocaleString(
                                      "es-ES",
                                      { maximumFractionDigits: 1 },
                                    )}{" "}
                                    kcal · P {entry.source.perBasis.protein} g · C{" "}
                                    {entry.source.perBasis.carbs} g · G{" "}
                                    {entry.source.perBasis.fat} g
                                  </p>
                                </>
                              )}
                              {entry.source.photoEstimate && (
                                <div className="photo-source-details">
                                  <p>
                                    Identificación visual.{" "}
                                    {entry.source.photoEstimate.estimatedGrams
                                      ? "El peso se ha estimado a partir de la foto."
                                      : "El peso se ha indicado en la conversación."}
                                  </p>
                                  <ul>
                                    {entry.source.photoEstimate.assumptions.map(
                                      (assumption, index) => (
                                        <li key={index}>{assumption}</li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                            </details>
                          )}
                        </div>
                        <b>
                          {entry.calories} <small>kcal</small>
                        </b>
                        <button
                          aria-label={`Eliminar ${entry.name}`}
                          onClick={() => void remove(entry.id)}
                        >
                          <TrashIcon />
                        </button>
                      </article>
                    ))}
                  </div>
                ))
              ) : (
                <div className="empty">
                  <span>
                    <ForkKnifeIcon />
                  </span>
                  <div>
                    <h3>
                      {selectedDate === today()
                        ? "Tu diario está preparado"
                        : "No hay comidas en esta fecha"}
                    </h3>
                    <p>
                      {selectedDate === today()
                        ? "Escribe en el chat qué has comido para registrar tu primera comida."
                        : "Elige otro día en el historial para consultar sus registros."}
                    </p>
                  </div>
                </div>
              )}
            </section>
            <FoodHistory
              days={days}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
            />
          </>
        )
      )}
    </section>
  );
}
