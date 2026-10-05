import { useProfile } from "../shared/ProfileContext.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys.js";

export type MeasurementKind = "waist" | "weight";

export function useMeasurementsQuery(kind: MeasurementKind) {
  const { id: profileId } = useProfile();
  return useQuery({
    queryKey: queryKeys.measurements(profileId, kind),
    queryFn: async () =>
      kind === "weight"
        ? (await window.calos.weightHistory(profileId)).map((item) => ({
            ...item,
            value: item.kilograms,
          }))
        : (await window.calos.waistHistory(profileId)).map((item) => ({
            ...item,
            value: item.centimeters,
          })),
  });
}

export function useSaveMeasurementMutation(kind: MeasurementKind) {
  const { id: profileId } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, value }: { date: string; value: number }) =>
      kind === "weight"
        ? window.calos.saveWeight(profileId, { date, kilograms: value })
        : window.calos.saveWaist(profileId, { date, centimeters: value }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.measurements(profileId, kind) }),
  });
}

export function useDeleteMeasurementMutation(kind: MeasurementKind) {
  const { id: profileId } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      kind === "weight"
        ? window.calos.deleteWeight(profileId, id)
        : window.calos.deleteWaist(profileId, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.measurements(profileId, kind) }),
  });
}
