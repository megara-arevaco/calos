import type { DaySummary, FoodHistoryDay } from "@calos/core";
import type { AppView } from "../App/App.hook.js";
import type { FoodEntry } from "@calos/core";
import { FoodHistory } from "../FoodHistory/index.js";
import { today, formatDate } from "../../shared/presentation.js";
import { FireIcon, ForkKnifeIcon, PlusIcon, TrashIcon } from "../../shared/icons.js";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        {t("food.macroTarget", { target, unit })}
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
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  return (
    <section
      className="content"
      id="comida-panel"
      hidden={view !== "comida"}
      aria-label={t("nav.food")}
    >
      <header>
        <div>
          <p className="date">{formatDate(selectedDate, locale)}</p>
          <h1>
            {selectedDate === today()
              ? t("food.titleToday")
              : t("food.titleHistory")}
          </h1>
        </div>
        <button
          className="quiet-button"
          onClick={() => {
            setSelectedDate(today());
            document.getElementById("chat-input")?.focus();
          }}
        >
          <PlusIcon weight="bold" /> {t("food.register")}
        </button>
      </header>
      <div className="diary-date-picker">
        <label htmlFor="diary-date">{t("food.consultDate")}</label>
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
          {t("common.today")}
        </button>
      </div>
      {selectedDate !== today() && (
        <p className="waist-help">
          {t("food.chatAddsToday")}
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
          {t("food.loading")}
        </p>
      ) : (
        !diaryError && (
          <>
            <div className="dashboard">
              <section className="calorie-panel">
                <div>
                  <p className="section-label">
                    {selectedDate === today() ? t("food.energyToday") : t("food.energyDay")}
                  </p>
                  <div className="calorie-copy">
                    <strong>{summary.total.calories.toLocaleString(locale)}</strong>
                    <span>{t("food.consumed")}</span>
                  </div>
                  <p className="remaining">
                    <FireIcon weight="fill" />{" "}
                    {selectedDate === today() ? `${t("food.remaining")} ` : `${t("food.untilGoal")} `}
                    <b>{remaining.toLocaleString(locale)} kcal</b>
                  </p>
                </div>
                <div
                  className="calorie-ring"
                  style={{ "--progress": `${ring * 3.6}deg` } as React.CSSProperties}
                >
                  <div>
                    <b>{Math.round(ring)}%</b>
                    <span>
                      {t("food.of", { value: summary.dailyGoal.calories.toLocaleString(locale) })} kcal
                    </span>
                  </div>
                </div>
              </section>
              <section className="macro-panel">
                <p className="section-label">{t("food.macros")}</p>
                <Macro
                  name={t("food.protein")}
                  amount={summary.total.protein}
                  target={summary.dailyGoal.protein}
                  unit=" g"
                  color="oklch(0.48 0.13 140)"
                />
                <Macro
                  name={t("food.carbs")}
                  amount={summary.total.carbs}
                  target={summary.dailyGoal.carbs}
                  unit=" g"
                  color="oklch(0.63 0.15 80)"
                />
                <Macro
                  name={t("food.fat")}
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
                  <p className="section-label">{t("food.diary")}</p>
                  <h2>{t("food.whatAte")}</h2>
                </div>
                <span>{t("food.entryCount", { count: summary.entries.length })}</span>
              </div>
              {groups.length ? (
                groups.map((group) => (
                  <div className="meal-group" key={group.meal}>
                    <h3>
                      <i>{mealIcon(group.meal)}</i>
                      {group.meal === "Desayuno" ? t("food.mealBreakfast") : group.meal === "Comida" ? t("food.mealLunch") : group.meal === "Cena" ? t("food.mealDinner") : group.meal}
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
                              {t("food.estimatedValues")} · {t("food.volumeConversion", { value: entry.source.volumeEstimate.gramsPerMilliliter })}{" "}
                              {entry.source.volumeEstimate.assumption}
                            </p>
                          )}
                          {entry.source?.photoEstimate && (
                            <p className="food-estimate-note">
                              {t("food.platePhoto")} · {t("food.composition")}{entry.source.photoEstimate.estimatedGrams ? ` ${t("food.andAmounts")}` : ""}
                            </p>
                          )}
                          {entry.source?.provider === "Estimación" && (
                            <p className="food-estimate-note">
                              {t("food.estimatedValues")} · {t("food.assistantEstimate")}
                            </p>
                          )}
                          {entry.source && (
                            <details className="food-source">
                              <summary>
                                {entry.source.provider === "USDA FoodData Central"
                                  ? t("food.usdaReference")
                                  : entry.source.provider === "Datos del usuario"
                                    ? t("food.userData")
                                    : entry.source.provider === "Estimación"
                                      ? t("food.estimated")
                                      : t("food.photoLabel")}
                              </summary>
                              {entry.source.provider === "USDA FoodData Central" ? (
                                <>
                                  <p>{entry.source.description}</p>
                                  <p>
                                    SR Legacy · FDC {entry.source.fdcId} ·{" "}
                                    {entry.source.grams.toLocaleString(locale, {
                                      maximumFractionDigits: 1,
                                    })}{" "}
                                    g
                                    {entry.source.portion
                                      ? ` · ${t("food.portion", { value: entry.source.portion })}`
                                      : ""}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p>{entry.source.evidence}</p>
                                  {entry.source.provider === "Estimación" && (
                                    <>
                                      <p>
                                        {t("food.estimatedNoRecipe")} {t("food.assumptions")}
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
                                        {t("food.rangeMidpoint")}
                                      </p>
                                    )}
                                  <p>
                                    {t("food.perBasis", { basis: entry.source.basis === "serving"
                                      ? t("food.serving")
                                      : entry.source.basis === "100ml"
                                        ? t("food.oneHundredMl")
                                        : t("food.oneHundredG") })}{" "}
                                    {entry.source.perBasis.calories.toLocaleString(
                                      locale,
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
                                    {t("food.visualIdentification")} {entry.source.photoEstimate.estimatedGrams
                                      ? t("measurements.weightEstimated")
                                      : t("measurements.weightGiven")}
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
                          aria-label={t("food.delete", { name: entry.name })}
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
                        ? t("food.ready")
                        : t("food.noMeals")}
                    </h3>
                    <p>
                      {selectedDate === today()
                        ? t("food.firstMeal")
                        : t("food.chooseDay")}
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
