import type { DaySummary, FoodHistoryDay } from "@calos/core";
import type { AppView } from "../App/App.hook.js";
import type { FoodEntry } from "@calos/core";
import { FoodHistory } from "../FoodHistory/index.js";
import { today, formatDate } from "../../shared/presentation.js";
import {
  BreakfastIcon,
  DinnerIcon,
  FireIcon,
  ForkKnifeIcon,
  LunchIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  SnackIcon,
  TrashIcon,
  UndoIcon,
} from "../../shared/icons.js";
import { useTranslation } from "react-i18next";
import { useState, type FormEvent } from "react";
import { ManualFoodForm } from "./ManualFoodForm.js";
import { RecipeEditor } from "./RecipeEditor.js";
import { DataPortability } from "./DataPortability.js";
import { useFoodTools } from "./useFoodTools.js";
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
  const percent =
    target > 0
      ? Math.min(100, Math.round((amount / target) * 100))
      : amount > 0
        ? 100
        : 0;
  const excess = Math.max(0, Math.round((amount - target) * 10) / 10);
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
        {excess > 0 && (
          <span className="macro-excess">
            {" "}
            · {t("food.macroAboveReference", { amount: excess, unit: unit.trim() })}
          </span>
        )}
      </span>
    </div>
  );
}

function MealIcon({ meal }: { meal: FoodEntry["meal"] }) {
  const Icon =
    meal === "Desayuno"
      ? BreakfastIcon
      : meal === "Comida"
        ? LunchIcon
        : meal === "Cena"
          ? DinnerIcon
          : SnackIcon;
  return <Icon />;
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
  onEdit: (entry: FoodEntry | null) => void;
  editingEntry: FoodEntry | null;
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
  onEdit,
  editingEntry,
}: FoodViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  const [manualOpen, setManualOpen] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  const [repeatEntryId, setRepeatEntryId] = useState<string | null>(null);
  const [repeatTargetDate, setRepeatTargetDate] = useState(today());
  const [feedback, setFeedback] = useState("");
  const [favoriteFailure, setFavoriteFailure] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [lastUndoId, setLastUndoId] = useState<string | undefined>();
  const tools = useFoodTools();
  const destination = formatDate(selectedDate, locale);
  const activeMeal = (meal: FoodEntry["meal"]) =>
    meal === "Desayuno"
      ? t("food.mealBreakfast")
      : meal === "Comida"
        ? t("food.mealLunch")
        : meal === "Cena"
          ? t("food.mealDinner")
          : t("food.mealSnack");
  const saveFavorite = async (
    event: FormEvent<HTMLFormElement>,
    entryIds: string[],
  ) => {
    event.preventDefault();
    setFavoriteFailure("");
    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      await tools.saveTemplate.mutateAsync({
        name: String(data.get("favoriteName")),
        entryIds,
        baseServings: Number(data.get("baseServings")),
      });
      setFeedback(t("food.favoriteSaved"));
      form.reset();
    } catch {
      setFavoriteFailure(t("food.favoriteError"));
    }
  };
  const repeat = async (event: FormEvent<HTMLFormElement>, entry: FoodEntry) => {
    event.preventDefault();
    const date = String(new FormData(event.currentTarget).get("repeatDate"));
    setFeedback("");
    try {
      await tools.repeatEntry.mutateAsync({ id: entry.id, date });
      setRepeatEntryId(null);
      setSelectedDate(date);
      setFeedback(t("food.repeatSaved", { date: formatDate(date, locale) }));
    } catch {
      setFeedback(t("food.repeatError"));
    }
  };
  const repeatFavorite = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const servings = Number(new FormData(event.currentTarget).get("servings"));
    setFeedback("");
    try {
      const result = await tools.repeatTemplate.mutateAsync({
        id,
        date: selectedDate,
        servings,
      });
      setLastUndoId(result.undoId);
      setFeedback(t("food.repeatSaved", { date: destination }));
    } catch {
      setFeedback(t("food.favoriteError"));
    }
  };
  const undoLastOperation = async () => {
    if (!lastUndoId) {
      return;
    }
    try {
      await tools.undo.mutateAsync(lastUndoId);
      setLastUndoId(undefined);
      setFeedback(t("assistant.undoSuccess"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("assistant.undoError"));
    }
  };
  const updateRecipe = async (
    template: import("@calos/core").FoodTemplate,
    expected: import("@calos/core").FoodTemplate,
  ) => {
    await tools.updateTemplate.mutateAsync({ template, expected });
    setEditingTemplate(null);
    setFeedback(t("food.recipeSaved"));
  };
  const restore = async (id: string) => {
    try {
      await tools.restore.mutateAsync(id);
      setLastDeleted(null);
      setFeedback(t("food.restored"));
    } catch {
      setFeedback(t("food.restoreError"));
    }
  };
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
            {selectedDate === today() ? t("food.titleToday") : t("food.titleHistory")}
          </h1>
        </div>
        <button
          className="quiet-button"
          onClick={() => {
            onEdit(null);
            setManualOpen((open) => !open);
          }}
          aria-expanded={manualOpen}
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
      <p className="diary-destination" role="status">
        {t("food.newEntriesDate", { date: destination })}
      </p>
      {(manualOpen || editingEntry) && (
        <ManualFoodForm
          key={editingEntry?.id ?? "new"}
          date={selectedDate}
          entry={editingEntry ?? undefined}
          onCancel={() => {
            setManualOpen(false);
            onEdit(null);
          }}
          onSaved={(entry) => {
            setManualOpen(false);
            onEdit(null);
            setSelectedDate(entry.eatenAt.slice(0, 10));
            setFeedback(t("food.saved"));
          }}
        />
      )}
      {feedback && (
        <p className="waist-notice" role="status">
          {feedback}{" "}
          {lastDeleted && (
            <button
              type="button"
              className="waist-link"
              onClick={() => void restore(lastDeleted)}
            >
              <UndoIcon /> {t("common.undo")}
            </button>
          )}
          {lastUndoId && (
            <button
              type="button"
              className="waist-link"
              onClick={() => void undoLastOperation()}
            >
              <UndoIcon /> {t("assistant.undoReceipt")}
            </button>
          )}
        </p>
      )}
      {diaryError && (
        <p className="waist-error" role="alert">
          {diaryError}{" "}
          <button type="button" className="waist-link" onClick={() => void refresh()}>
            {t("common.retry")}
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
                    {selectedDate === today()
                      ? t("food.energyToday")
                      : t("food.energyDay")}
                  </p>
                  <div className="calorie-copy">
                    <strong>{summary.total.calories.toLocaleString(locale)}</strong>
                    <span>{t("food.consumed")}</span>
                  </div>
                  <p
                    className={`remaining${summary.total.calories > summary.dailyGoal.calories ? " remaining-over" : ""}`}
                  >
                    <FireIcon />{" "}
                    {summary.total.calories > summary.dailyGoal.calories
                      ? t("food.aboveReference", {
                          amount: (
                            summary.total.calories - summary.dailyGoal.calories
                          ).toLocaleString(locale),
                        })
                      : `${selectedDate === today() ? `${t("food.remaining")} ` : `${t("food.untilGoal")} `}${remaining.toLocaleString(locale)} kcal`}
                  </p>
                </div>
                <div
                  className="calorie-ring"
                  style={{ "--progress": `${ring * 3.6}deg` } as React.CSSProperties}
                >
                  <div>
                    <b>{Math.round(ring)}%</b>
                    <span>
                      {t("food.of", {
                        value: summary.dailyGoal.calories.toLocaleString(locale),
                      })}{" "}
                      kcal
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
                      <i>
                        <MealIcon meal={group.meal} />
                      </i>
                      {activeMeal(group.meal)}
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
                              {t("food.estimatedValues")} ·{" "}
                              {t("food.volumeConversion", {
                                value: entry.source.volumeEstimate.gramsPerMilliliter,
                              })}{" "}
                              {entry.source.volumeEstimate.assumption}
                            </p>
                          )}
                          {entry.source?.photoEstimate && (
                            <p className="food-estimate-note">
                              {t("food.platePhoto")} · {t("food.composition")}
                              {entry.source.photoEstimate.estimatedGrams
                                ? ` ${t("food.andAmounts")}`
                                : ""}
                            </p>
                          )}
                          {entry.source?.provider === "Estimación" && (
                            <p className="food-estimate-note">
                              {t("food.estimatedValues")} ·{" "}
                              {t("food.assistantEstimate")}
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
                                      : t("food.sourceLabel")}
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
                                        {t("food.estimatedNoRecipe")}{" "}
                                        {t("food.assumptions")}
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
                                    ) && <p>{t("food.rangeMidpoint")}</p>}
                                  {entry.source.provider === "Datos del usuario" &&
                                    entry.source.amountRanges &&
                                    Object.values(entry.source.amountRanges).some(
                                      (range) => range.min !== range.max,
                                    ) && (
                                      <p>
                                        {t("food.amountRange", {
                                          kcal: `${entry.source.amountRanges.calories.min}–${entry.source.amountRanges.calories.max}`,
                                          protein: `${entry.source.amountRanges.protein.min}–${entry.source.amountRanges.protein.max}`,
                                          carbs: `${entry.source.amountRanges.carbs.min}–${entry.source.amountRanges.carbs.max}`,
                                          fat: `${entry.source.amountRanges.fat.min}–${entry.source.amountRanges.fat.max}`,
                                        })}
                                      </p>
                                    )}
                                  <p>
                                    {t("food.perBasis", {
                                      basis:
                                        entry.source.basis === "serving"
                                          ? t("food.serving")
                                          : entry.source.basis === "100ml"
                                            ? t("food.oneHundredMl")
                                            : t("food.oneHundredG"),
                                    })}{" "}
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
                                    {t("food.visualIdentification")}{" "}
                                    {entry.source.photoEstimate.estimatedGrams
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
                        <div className="food-row-actions">
                          <button
                            type="button"
                            aria-label={t("food.editEntry", { name: entry.name })}
                            onClick={() => {
                              setManualOpen(false);
                              onEdit(entry);
                            }}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            aria-label={t("food.repeatEntry", { name: entry.name })}
                            aria-expanded={repeatEntryId === entry.id}
                            onClick={() => {
                              setRepeatEntryId(
                                repeatEntryId === entry.id ? null : entry.id,
                              );
                              setRepeatTargetDate(today());
                            }}
                          >
                            <RepeatIcon />
                          </button>
                          <button
                            type="button"
                            aria-label={t("food.delete", { name: entry.name })}
                            onClick={() =>
                              void remove(entry.id)
                                .then(() => {
                                  setLastDeleted(entry.id);
                                  setFeedback(t("food.deleted"));
                                })
                                .catch(() => undefined)
                            }
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        {repeatEntryId === entry.id && (
                          <form
                            className="repeat-entry-form"
                            onSubmit={(event) => void repeat(event, entry)}
                          >
                            <label>
                              {t("food.repeatDate")}
                              <input
                                name="repeatDate"
                                type="date"
                                max={today()}
                                value={repeatTargetDate}
                                onChange={(event) =>
                                  setRepeatTargetDate(event.target.value)
                                }
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              className="quiet-button"
                              disabled={tools.repeatEntry.isPending}
                            >
                              {t("food.confirmRepeat")}
                            </button>
                          </form>
                        )}
                      </article>
                    ))}
                    <details className="favorite-save">
                      <summary>
                        {t("food.saveFavorite", { meal: activeMeal(group.meal) })}
                      </summary>
                      <form
                        onSubmit={(event) =>
                          void saveFavorite(
                            event,
                            group.entries.map((entry) => entry.id),
                          )
                        }
                      >
                        <label>
                          {t("food.favoriteName")}
                          <input
                            name="favoriteName"
                            maxLength={80}
                            defaultValue={activeMeal(group.meal)}
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
                            defaultValue="1"
                            required
                          />
                        </label>
                        <button
                          type="submit"
                          className="quiet-button"
                          disabled={tools.saveTemplate.isPending}
                        >
                          {t("food.saveFavoriteAction")}
                        </button>
                      </form>
                    </details>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <span>
                    <ForkKnifeIcon />
                  </span>
                  <div>
                    <h3>
                      {selectedDate === today() ? t("food.ready") : t("food.noMeals")}
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
            {favoriteFailure && (
              <p className="waist-error" role="alert">
                {favoriteFailure}
              </p>
            )}
            {!!tools.templates.data?.length && (
              <section className="food-favorites" aria-labelledby="favorites-heading">
                <h2 id="favorites-heading">{t("food.favorites")}</h2>
                <p className="waist-help">{t("food.favoriteHelp")}</p>
                {editingTemplate && (
                  <RecipeEditor
                    key={editingTemplate}
                    template={
                      tools.templates.data.find((item) => item.id === editingTemplate)!
                    }
                    saving={tools.updateTemplate.isPending}
                    onSave={updateRecipe}
                    onCancel={() => setEditingTemplate(null)}
                  />
                )}
                <ul>
                  {tools.templates.data.map((template) => (
                    <li key={template.id}>
                      <span>
                        <strong>{template.name}</strong>
                        <small>
                          {t("food.entryCount", { count: template.entries.length })} ·{" "}
                          {t("food.baseServingsValue", {
                            count: template.baseServings,
                          })}
                        </small>
                      </span>
                      <div className="recipe-actions">
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => setEditingTemplate(template.id)}
                        >
                          <PencilIcon /> {t("food.editRecipeButton")}
                        </button>
                        <form
                          className="recipe-repeat-form"
                          onSubmit={(event) => void repeatFavorite(event, template.id)}
                        >
                          <label>
                            {t("food.servingsToLog", { name: template.name })}
                            <input
                              name="servings"
                              type="number"
                              min="0.1"
                              max="1000"
                              step="0.1"
                              defaultValue={template.baseServings}
                              required
                            />
                          </label>
                          <button
                            type="submit"
                            className="quiet-button"
                            disabled={tools.repeatTemplate.isPending}
                          >
                            <RepeatIcon />{" "}
                            {t("food.repeatFavorite", { name: template.name })}
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <FoodHistory
              days={days}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
            />
            <details className="food-trash">
              <summary>
                {t("food.trash")} · {tools.trash.data?.length ?? 0}
              </summary>
              {tools.trash.data?.length ? (
                <ul>
                  {tools.trash.data.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.quantity} ·{" "}
                          {formatDate(entry.eatenAt.slice(0, 10), locale)}
                        </small>
                      </span>
                      <div className="trash-actions">
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => void restore(entry.id)}
                        >
                          <UndoIcon /> {t("food.restore", { name: entry.name })}
                        </button>
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() => {
                            if (
                              !window.confirm(
                                t("food.deleteTrashConfirm", { name: entry.name }),
                              )
                            ) {
                              return;
                            }
                            void tools.deleteTrashEntry
                              .mutateAsync(entry.id)
                              .then(() => setFeedback(t("food.trashDeleted")))
                              .catch(() => setFeedback(t("food.trashDeleteError")));
                          }}
                        >
                          <TrashIcon />{" "}
                          {t("food.deletePermanently", { name: entry.name })}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("food.trashEmpty")}</p>
              )}
            </details>
            <DataPortability />
          </>
        )
      )}
    </section>
  );
}
