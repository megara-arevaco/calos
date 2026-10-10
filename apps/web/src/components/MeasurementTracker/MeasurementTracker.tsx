import { MeasurementChart } from "../MeasurementChart/index.js";
import { useMeasurementTracker } from "./MeasurementTracker.hook.js";
import { useTranslation } from "react-i18next";
const numberLabel = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

const dateLabel = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

export function MeasurementTracker({ kind }: { kind: "waist" | "weight" }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
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
            {isWeight ? t("measurements.weightIntro") : t("measurements.waistIntro")}
          </p>
        </div>
      </div>
      <form className="waist-form" onSubmit={save}>
        <div>
          <label htmlFor={`${prefix}-date`}>{t("common.date")}</label>
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
            {isWeight ? t("measurements.weight") : t("measurements.waist")}
          </label>
          <input
            id={`${prefix}-value`}
            type="text"
            inputMode="decimal"
            placeholder={isWeight ? t("measurements.exampleWeight") : t("measurements.exampleWaist")}
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
          {busy ? t("objectives.saving") : updating ? t("measurements.update") : t("measurements.save")}
        </button>
      </form>
      <p id={`${prefix}-hint`} className="waist-help">
        {t("measurements.onePerDate")} {isWeight
          ? t("measurements.weightAdvice")
          : t("measurements.waistAdvice")}
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
            {t("measurements.reload")}
          </button>
        </p>
      )}
      <p className="waist-notice" role="status">
        {notice}
      </p>
      {!loading && !error && (
        <MeasurementChart
          measurements={history}
          title={isWeight ? t("measurements.weightTitle") : t("measurements.waistTitle")}
          unit={unit}
          id={`${prefix}-chart-title`}
        />
      )}
      {loading ? (
        <p className="waist-help">{t("measurements.loading")}</p>
      ) : latest ? (
        <>
          <p className="waist-summary">
            {t("measurements.latest")}{" "}
            <strong>
              {numberLabel(latest.value, locale)} {unit}
            </strong>{" "}
            <span>· {dateLabel(latest.date, locale)}</span>
            {history.length > 1 && (
              <span className="waist-change">
                {change > 0 ? "+" : ""}
                {numberLabel(change, locale)} {unit} {t("measurements.since", { date: dateLabel(first!.date, locale) })}
              </span>
            )}
          </p>
          <details className="waist-history" open>
            <summary>
              {t("measurements.history", { count: history.length })}
            </summary>
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.date}>{dateLabel(item.date, locale)}</time>
                  <strong>
                    {numberLabel(item.value, locale)} <small>{unit}</small>
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
                    aria-label={t("measurements.editDate", { date: dateLabel(item.date, locale) })}
                  >
                    {t("measurements.edit")}
                  </button>
                  <button
                    type="button"
                    className="waist-delete"
                    disabled={busy}
                    onClick={() => void remove(item.id)}
                    aria-label={t("measurements.deleteDate", { date: dateLabel(item.date, locale) })}
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
            {t("measurements.first")}
          </p>
        )
      )}
    </section>
  );
}
