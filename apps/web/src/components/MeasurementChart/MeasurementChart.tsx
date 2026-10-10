import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
export interface MeasurementPoint {
  id: string;
  date: string;
  value: number;
}

const valueLabel = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

const dateLabel = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

export function MeasurementChart({
  measurements,
  title,
  unit,
  id,
}: {
  measurements: MeasurementPoint[];
  title: string;
  unit: string;
  id: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    if (!container.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setWidth(Math.max(300, Math.round(entry.contentRect.width)));
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ordered = [...measurements].sort((a, b) => a.date.localeCompare(b.date));

  if (!ordered.length) {
    return (
      <section ref={container} className="waist-chart" aria-labelledby={id}>
        <h3 id={id}>{title}</h3>
        <p className="waist-help">{t("measurements.chartFirst")}</p>
      </section>
    );
  }

  const selected = ordered.find((item) => item.id === selectedId) ?? ordered.at(-1)!;
  const values = ordered.map((item) => item.value);
  const lowest = Math.min(...values),
    highest = Math.max(...values);
  const padding = Math.max(1, (highest - lowest) * 0.15);
  const min = Math.max(0, lowest - padding),
    max = highest + padding;
  const start = Date.parse(ordered[0].date),
    end = Date.parse(ordered.at(-1)!.date);
  const height = 250,
    left = 52,
    right = 16,
    top = 22,
    bottom = 42;
  const x = (date: string) =>
    start === end
      ? (left + width - right) / 2
      : left + ((Date.parse(date) - start) / (end - start)) * (width - left - right);
  const y = (value: number) =>
    top + ((max - value) / (max - min)) * (height - top - bottom);
  const points = ordered.map((item) => `${x(item.date)},${y(item.value)}`).join(" ");
  return (
    <section ref={container} className="waist-chart" aria-labelledby={id}>
      <div className="chart-heading">
        <h3 id={id}>{title}</h3>
        <p aria-live="polite">
          <strong>
            {valueLabel(selected.value, locale)} {unit}
          </strong>
          <span> · {dateLabel(selected.date, locale)}</span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={t("measurements.chartAria", { title, unit })}
      >
        {[0, 1, 2, 3].map((tick) => {
          const value = min + ((max - min) * tick) / 3;
          return (
            <g key={tick}>
              <line
                className="chart-gridline"
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
              />
              <text
                className="chart-label"
                x={left - 12}
                y={y(value) + 4}
                textAnchor="end"
              >
                {valueLabel(value, locale)}
              </text>
            </g>
          );
        })}
        <text className="chart-label" x={left} y={12}>
          {unit}
        </text>
        {ordered.length > 1 && <polyline className="chart-line" points={points} />}
        {ordered.map((item) => (
          <g
            key={item.id}
            className={`chart-point ${selected.id === item.id ? "selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`${dateLabel(item.date, locale)}: ${valueLabel(item.value, locale)} ${unit}`}
            aria-pressed={selected.id === item.id}
            onClick={() => setSelectedId(item.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(item.id);
              }
            }}
          >
            <title>
              {dateLabel(item.date, locale)} · {valueLabel(item.value, locale)} {unit}
            </title>
            <circle className="chart-hit" cx={x(item.date)} cy={y(item.value)} r={14} />
            <circle
              className="chart-dot"
              cx={x(item.date)}
              cy={y(item.value)}
              r={selected.id === item.id ? 6 : 4}
            />
          </g>
        ))}
        <text
          className="chart-label"
          x={ordered.length === 1 ? x(ordered[0].date) : left}
          y={height - 12}
          textAnchor={ordered.length === 1 ? "middle" : "start"}
        >
          {dateLabel(ordered[0].date, locale)}
        </text>
        {ordered.length > 1 && (
          <text
            className="chart-label"
            x={width - right}
            y={height - 12}
            textAnchor="end"
          >
            {dateLabel(ordered.at(-1)!.date, locale)}
          </text>
        )}
      </svg>
      <p className="waist-help">
        {ordered.length === 1
          ? t("measurements.chartAdd")
          : t("measurements.chartSelect")}
      </p>
    </section>
  );
}
