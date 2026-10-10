import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "../../shared/ProfileContext.js";
import { queryKeys } from "../../queries/queryKeys.js";
import type { FoodTemplate, NutritionRetention } from "@calos/core";

export function useFoodTools() {
  const profile = useProfile();
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: queryKeys.templates(profile.id),
    queryFn: () => window.calos.templates(profile.id),
  });
  const trash = useQuery({
    queryKey: queryKeys.trash(profile.id),
    queryFn: () => window.calos.deletedEntries(profile.id),
  });
  const undoHistory = useQuery({
    queryKey: queryKeys.undoHistory(profile.id),
    queryFn: () => window.calos.undoHistory(profile.id),
  });
  const backups = useQuery({
    queryKey: queryKeys.backups(profile.id),
    queryFn: () => window.calos.backups(profile.id),
  });
  const retention = useQuery({
    queryKey: queryKeys.retention(profile.id),
    queryFn: () => window.calos.retention(profile.id),
  });
  const refreshDiary = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.days(profile.id) }),
      client.invalidateQueries({ queryKey: queryKeys.foodHistory(profile.id) }),
      client.invalidateQueries({ queryKey: queryKeys.undoHistory(profile.id) }),
    ]);
  };
  const repeatEntry = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      window.calos.repeatEntry(profile.id, id, date),
    onSuccess: refreshDiary,
  });
  const saveTemplate = useMutation({
    mutationFn: ({
      name,
      entryIds,
      baseServings,
    }: {
      name: string;
      entryIds: string[];
      baseServings: number;
    }) => window.calos.saveTemplate(profile.id, { name, entryIds, baseServings }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.templates(profile.id) }),
  });
  const updateTemplate = useMutation({
    mutationFn: ({
      template,
      expected,
    }: {
      template: FoodTemplate;
      expected: FoodTemplate;
    }) => window.calos.updateTemplate(profile.id, template, expected),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.templates(profile.id) }),
  });
  const repeatTemplate = useMutation({
    mutationFn: ({
      id,
      date,
      servings,
    }: {
      id: string;
      date: string;
      servings: number;
    }) => window.calos.repeatTemplate(profile.id, id, date, servings),
    onSuccess: refreshDiary,
  });
  const undo = useMutation({
    mutationFn: (id: string) => window.calos.undoOperation(profile.id, id),
    onSuccess: refreshDiary,
  });
  const deleteTrashEntry = useMutation({
    mutationFn: (id: string) => window.calos.deleteTrashEntry(profile.id, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.trash(profile.id) }),
  });
  const saveRetention = useMutation({
    mutationFn: (value: NutritionRetention) =>
      window.calos.saveRetention(profile.id, value),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.retention(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.trash(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.backups(profile.id) }),
      ]);
    },
  });
  const restoreBackup = useMutation({
    mutationFn: (id: string) => window.calos.restoreBackup(profile.id, id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["nutrition", profile.id] });
    },
  });
  const deleteBackup = useMutation({
    mutationFn: (id: string) => window.calos.deleteBackup(profile.id, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.backups(profile.id) }),
  });
  const restore = useMutation({
    mutationFn: (id: string) => window.calos.restoreEntry(profile.id, id),
    onSuccess: async () => {
      await Promise.all([
        refreshDiary(),
        client.invalidateQueries({ queryKey: queryKeys.trash(profile.id) }),
      ]);
    },
  });
  return {
    templates,
    trash,
    undoHistory,
    backups,
    retention,
    repeatEntry,
    saveTemplate,
    updateTemplate,
    repeatTemplate,
    undo,
    deleteTrashEntry,
    saveRetention,
    restoreBackup,
    deleteBackup,
    restore,
  };
}
