import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  useMeasurementsQuery,
  useSaveMeasurementMutation,
  useDeleteMeasurementMutation,
  type MeasurementKind,
} from "../../queries/measurement.queries.js";
import { today } from "../../shared/presentation.js";

export function useMeasurementTracker(kind: MeasurementKind) {
  const { t } = useTranslation();
  const isWeight = kind === "weight";
  const title = isWeight ? t("measurements.weightTitle") : t("measurements.waistTitle");
  const unit = isWeight ? "kg" : "cm";
  const max = isWeight ? 500 : 300;
  const prefix = isWeight ? "weight" : "waist";
  const historyQuery = useMeasurementsQuery(kind);
  const saveMutation = useSaveMeasurementMutation(kind);
  const deleteMutation = useDeleteMeasurementMutation(kind);
  const history = historyQuery.data ?? [];
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const loading = historyQuery.isPending;
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    setError("");
    return historyQuery.refetch();
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || loading) {
      return;
    }

    const amount = Number(value.trim().replace(",", "."));
    setError("");
    setNotice("");
    if (!Number.isFinite(amount) || amount < 0.1 || amount > max) {
      setError(t("measurements.invalid", { max, unit }));
      return;
    }
    try {
      const updating = history.some((item) => item.date === date);
      await saveMutation.mutateAsync({ date, value: amount });
      setValue("");
      setNotice(updating ? t("measurements.updated") : t("measurements.saved"));
    } catch {
      setError(
        t("measurements.saveError"),
      );
    }
  };
  const remove = async (id: string) => {
    if (busy) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await deleteMutation.mutateAsync(id);
      setNotice(t("measurements.deleted"));
    } catch {
      setError(t("measurements.deleteError"));
    }
  };
  const displayError =
    error ||
    (historyQuery.isError
      ? t("measurements.loadError")
      : "");
  const latest = history[0];
  const first = history.at(-1);
  const change =
    latest && first ? Math.round((latest.value - first.value) * 10) / 10 : 0;
  const updating = history.some((item) => item.date === date);

  return {
    isWeight,
    title,
    unit,
    max,
    prefix,
    history,
    date,
    setDate,
    value,
    setValue,
    loading,
    busy,
    error: displayError,
    notice,
    setNotice,
    load,
    save,
    remove,
    latest,
    first,
    change,
    updating,
  };
}
