import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DaySummary, FoodEntry } from "@calos/core";
import {
  useDayQuery,
  useFoodHistoryQuery,
  useDeleteFoodMutation,
} from "../../queries/nutrition.queries.js";
import { today } from "../../shared/presentation.js";
const initialSummary: DaySummary = {
  date: today(),
  entries: [],
  dailyGoal: { calories: 2200, protein: 140, carbs: 250, fat: 70 },
  total: { calories: 0, protein: 0, carbs: 0, fat: 0 },
};

export type AppView = "comida" | "cintura" | "peso" | "asistente";

export function useApp() {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState<AppView>("comida");
  const day = useDayQuery(selectedDate);
  const history = useFoodHistoryQuery();
  const deleteFood = useDeleteFoodMutation();
  const summary = day.data ?? { ...initialSummary, date: selectedDate };
  const groups = useMemo(
    () =>
      ["Desayuno", "Comida", "Cena", "Snack"]
        .map((meal) => ({
          meal: meal as FoodEntry["meal"],
          entries: summary.entries.filter((entry) => entry.meal === meal),
        }))
        .filter((group) => group.entries.length),
    [summary.entries],
  );
  const remove = async (id: string) => {
    await deleteFood.mutateAsync(id);
  };
  const refresh = () => {
    deleteFood.reset();
    return Promise.all([day.refetch(), history.refetch()]);
  };
  return {
    view,
    setView,
    selectedDate,
    setSelectedDate,
    summary,
    days: history.data ?? [],
    groups,
    remaining: Math.max(0, summary.dailyGoal.calories - summary.total.calories),
    ring: Math.min(100, (summary.total.calories / summary.dailyGoal.calories) * 100),
    diaryLoading: day.isPending || history.isPending,
    diaryError: deleteFood.isError
      ? t("food.deleteError")
      : day.isError || history.isError
        ? t("food.loadError")
        : "",
    refresh,
    remove,
  };
}
