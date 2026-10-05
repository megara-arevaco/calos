import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NutritionPlan } from "@calos/core";
import { useProfile } from "../shared/ProfileContext.js";
import { queryKeys } from "./queryKeys.js";
export function useNutritionPlan() {
  const { id } = useProfile();
  return useQuery({
    queryKey: queryKeys.plan(id),
    queryFn: () => window.calos.nutritionPlan(id),
  });
}

export function useSaveNutritionPlan() {
  const { id } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      plan,
      previous,
    }: {
      plan: NutritionPlan;
      previous: NutritionPlan;
    }) => window.calos.saveNutritionPlan(id, plan, previous),
    onSuccess: async (plan) => {
      client.setQueryData(queryKeys.plan(id), plan);
      await client.invalidateQueries({ queryKey: queryKeys.days(id) });
    },
  });
}
