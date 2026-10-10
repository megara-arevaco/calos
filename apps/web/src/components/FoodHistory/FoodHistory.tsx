import type { FoodHistoryDay } from "@calos/core";
import { useTranslation } from "react-i18next";

const dateLabel = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

export function FoodHistory({
  days,
  selectedDate,
  onSelect,
}: {
  days: FoodHistoryDay[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  return (
    <section className="food-history" aria-labelledby="food-history-title">
      <h2 id="food-history-title">{t("food.history")}</h2>
      <p className="waist-help">
        {t("food.historyHelp")}
      </p>
      {days.length ? (
        <ul>
          {days.map((day) => (
            <li key={day.date}>
              <button
                type="button"
                className={selectedDate === day.date ? "selected" : ""}
                aria-pressed={selectedDate === day.date}
                onClick={() => onSelect(day.date)}
              >
                <span>
                  <time dateTime={day.date}>{dateLabel(day.date, locale)}</time>
                  <small>
                    {t("food.entryCount", { count: day.entryCount })}
                  </small>
                </span>
                <strong>
                  {day.total.calories.toLocaleString(locale)} <small>kcal</small>
                </strong>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="waist-help">{t("food.historyEmpty")}</p>
      )}
    </section>
  );
}
