import type { FoodHistoryDay } from "@calos/core";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("es-ES", {
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
  return (
    <section className="food-history" aria-labelledby="food-history-title">
      <h2 id="food-history-title">Historial de comidas</h2>
      <p className="waist-help">
        Selecciona un día para consultar sus comidas y macronutrientes.
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
                  <time dateTime={day.date}>{dateLabel(day.date)}</time>
                  <small>
                    {day.entryCount} {day.entryCount === 1 ? "registro" : "registros"}
                  </small>
                </span>
                <strong>
                  {day.total.calories.toLocaleString("es-ES")} <small>kcal</small>
                </strong>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="waist-help">Los días aparecerán aquí cuando registres comidas.</p>
      )}
    </section>
  );
}
