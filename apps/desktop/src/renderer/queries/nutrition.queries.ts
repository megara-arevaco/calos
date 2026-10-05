import { useProfile } from "../shared/ProfileContext.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatDiaryContext, ChatMessage, NutritionImage } from "@calos/core";
import { queryKeys } from "./queryKeys.js";

export function useDayQuery(date: string) {
  const { id: profileId } = useProfile();
  return useQuery({
    queryKey: queryKeys.day(profileId, date),
    queryFn: () => window.calos.today(profileId, date),
  });
}

export function useFoodHistoryQuery() {
  const { id: profileId } = useProfile();
  return useQuery({
    queryKey: queryKeys.foodHistory(profileId),
    queryFn: () => window.calos.foodHistory(profileId),
  });
}

export function useDeleteFoodMutation() {
  const { id: profileId } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.calos.deleteEntry(profileId, id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.days(profileId) }),
        client.invalidateQueries({ queryKey: queryKeys.foodHistory(profileId) }),
      ]);
    },
  });
}

export function useChatMutation() {
  const { id: profileId } = useProfile();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      message,
      history,
      image,
      context,
    }: {
      message: string;
      history: ChatMessage[];
      image?: NutritionImage;
      context: ChatDiaryContext;
    }) => window.calos.sendMessage(profileId, message, history, image, context),
    onSuccess: async (reply) => {
      if (
        reply.entriesAdded.length ||
        reply.entriesUpdated?.length ||
        reply.dataChanged
      ) {
        await Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.days(profileId) }),
          client.invalidateQueries({ queryKey: queryKeys.foodHistory(profileId) }),
        ]);
      }
    },
  });
}
