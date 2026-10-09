import { MeasurementChart } from "../MeasurementChart/index.js";
import { useMeasurementTracker } from "./MeasurementTracker.hook.js";
const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

export function MeasurementTracker({ kind }: { kind: "waist" | "weight" }) {
  const {
    isWeight,
    title,
    unit,
    prefix,
    history,
    date,
    setDate,
    value,
    setValue,
    loading,
    busy,
    error,
    notice,
    setNotice,
    load,
    save,
    remove,
    latest,
    first,
    change,
    updating,
  } = useMeasurementTracker(kind);
  return (
    <section
      className="waist"
      id={isWeight ? "peso" : "cintura"}
      aria-labelledby={`${prefix}-title`}
    >
      <div className="diary-title">
        <div>
          <h2 id={`${prefix}-title`}>{title}</h2>
          <p className="waist-help">
            {isWeight
              ? "Registra tu peso en kilos para seguir su evolución."
              : "Registra el contorno de tu cintura en centímetros."}
          </p>
        </div>
      </div>
      <form className="waist-form" onSubmit={save}>
        <div>
          <label htmlFor={`${prefix}-date`}>Fecha</label>
          <input
            id={`${prefix}-date`}
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setNotice("");
            }}
            required
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-value`}>
            {isWeight ? "Peso (kg)" : "Contorno (cm)"}
          </label>
          <input
            id={`${prefix}-value`}
            type="text"
            inputMode="decimal"
            placeholder={isWeight ? "Ej. 99,0" : "Ej. 82,5"}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setNotice("");
            }}
            required
            disabled={busy}
            aria-describedby={`${prefix}-hint`}
          />
        </div>
        <button
          className="quiet-button"
          type="submit"
          disabled={busy || loading || !value.trim() || !date}
        >
          {busy ? "Guardando…" : updating ? "Actualizar medida" : "Guardar medida"}
        </button>
      </form>
      <p id={`${prefix}-hint`} className="waist-help">
        Una medida por fecha.{" "}
        {isWeight
          ? "Pésate en condiciones similares para comparar."
          : "Mídete siempre de la misma forma para comparar."}
      </p>
      {error && (
        <p className="waist-error" role="alert">
          {error}{" "}
          <button
            className="waist-link"
            type="button"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Recargar historial
          </button>
        </p>
      )}
      <p className="waist-notice" role="status">
        {notice}
      </p>
      {!loading && !error && (
        <MeasurementChart
          measurements={history}
          title={isWeight ? "Evolución del peso" : "Evolución de la cintura"}
          unit={unit}
          id={`${prefix}-chart-title`}
        />
      )}
      {loading ? (
        <p className="waist-help">Cargando medidas…</p>
      ) : latest ? (
        <>
          <p className="waist-summary">
            Última medida:{" "}
            <strong>
              {number.format(latest.value)} {unit}
            </strong>{" "}
            <span>· {dateLabel(latest.date)}</span>
            {history.length > 1 && (
              <span className="waist-change">
                {change > 0 ? "+" : ""}
                {number.format(change)} {unit} desde el {dateLabel(first!.date)}
              </span>
            )}
          </p>
          <details className="waist-history" open>
            <summary>
              Historial · {history.length} {history.length === 1 ? "medida" : "medidas"}
            </summary>
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.date}>{dateLabel(item.date)}</time>
                  <strong>
                    {number.format(item.value)} <small>{unit}</small>
                  </strong>
                  <button
                    type="button"
                    className="waist-link"
                    disabled={busy}
                    onClick={() => {
                      setDate(item.date);
                      setValue(String(item.value).replace(".", ","));
                      setNotice("");
                      document.getElementById(`${prefix}-value`)?.focus();
                    }}
                    aria-label={`Editar medida del ${dateLabel(item.date)}`}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="waist-delete"
                    disabled={busy}
                    onClick={() => void remove(item.id)}
                    aria-label={`Eliminar medida del ${dateLabel(item.date)}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        !error && (
          <p className="waist-help">
            Guarda tu primera medida para empezar a ver la evolución.
          </p>
        )
      )}
    </section>
  );
}
