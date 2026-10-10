import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ChatMessage, FoodEntry, NutritionPlanProposal } from "@calos/core";
import type { PhotoAttachment } from "../NutritionPhotoInput/index.js";
import type { AppView } from "../App/App.hook.js";
import { useChatMutation } from "../../queries/nutrition.queries.js";
import { useSaveNutritionPlan } from "../../queries/plan.queries.js";
import { today } from "../../shared/presentation.js";
import { useProfile } from "../../shared/ProfileContext.js";
import { queryKeys } from "../../queries/queryKeys.js";

export function useChatAssistant(view: AppView, selectedDate: string) {
  const { t } = useTranslation();
  const greeting = t("assistant.greeting");
  const chatMessages = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: greeting,
    },
  ]);
  const [receiptState, setReceipt] = useState<FoodEntry[] | null>(null);
  const [receiptUndoId, setReceiptUndoId] = useState<string | undefined>();
  const [undoFeedback, setUndoFeedback] = useState("");
  const profile = useProfile();
  const client = useQueryClient();
  const undoHistory = useQuery({
    queryKey: queryKeys.undoHistory(profile.id),
    queryFn: () => window.calos.undoHistory(profile.id),
  });
  const undoMutation = useMutation({
    mutationFn: (id: string) => window.calos.undoOperation(profile.id, id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.days(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.foodHistory(profile.id) }),
        client.invalidateQueries({ queryKey: queryKeys.undoHistory(profile.id) }),
      ]);
    },
  });
  const mutation = useChatMutation();
  const planMutation = useSaveNutritionPlan();
  const [proposal, setProposal] = useState<NutritionPlanProposal | null>(null);
  const applyProposal = async () => {
    if (!proposal || planMutation.isPending) {
      return;
    }
    try {
      const plan = await planMutation.mutateAsync({
        plan: proposal.plan,
        previous: proposal.previousPlan,
      });
      setProposal(null);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: t("assistant.goalsUpdated", {
            goal: plan.goal,
            calories: plan.dailyGoal.calories,
            protein: plan.dailyGoal.protein,
            carbs: plan.dailyGoal.carbs,
            fat: plan.dailyGoal.fat,
          }),
        },
      ]);
    } catch {
      /* Keep proposal and show the error. */
    }
  };
  const sending = mutation.isPending || planMutation.isPending;
  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant"
        ? [{ role: "assistant", text: greeting }]
        : current,
    );
  }, [greeting]);
  useEffect(() => {
    if (chatMessages.current) {
      chatMessages.current.scrollTop =
        view === "asistente" && messages.length === 1
          ? 0
          : chatMessages.current.scrollHeight;
    }
  }, [messages, sending, view]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message =
      draft.trim() ||
      (photo
        ? photo.image.kind === "plate"
          ? t("assistant.photoPlatePrompt")
          : t("assistant.photoLabelPrompt")
        : "");

    if (!message || sending) {
      return;
    }
    setDraft("");
    setReceipt([]);
    setReceiptUndoId(undefined);
    setUndoFeedback("");
    planMutation.reset();
    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: `${message}${photo ? `\n${photo.image.kind === "plate" ? t("assistant.plateMarker") : t("assistant.labelMarker")}` : ""}`,
      },
    ]);
    try {
      const reply = await mutation.mutateAsync({
        message,
        history: messages
          .slice(-10)
          .map((item) => ({ ...item, text: item.text.slice(0, 4000) })),
        image: photo?.image,
        context: {
          plateDraft: photo?.draft,
          goalDraft: proposal ?? undefined,
          tab: view,
          date: selectedDate,
          mode: selectedDate === today() ? "day" : "history",
        },
      });
      setProposal(reply.goalProposal ?? null);
      setReceipt([...(reply.entriesAdded ?? []), ...(reply.entriesUpdated ?? [])]);
      setReceiptUndoId(reply.undoId);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: reply.message },
      ]);
      if (
        reply.entriesAdded.length ||
        reply.entriesUpdated?.length ||
        reply.clearPhoto
      ) {
        setPhoto(null);
      } else if (reply.plateDraft) {
        setPhoto((current) =>
          current ? { ...current, draft: reply.plateDraft } : null,
        );
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: t("assistant.chatError"),
        },
      ]);
    }
  };
  const receipt = receiptState ?? undoHistory.data?.[0]?.entries ?? [];
  const activeUndoId =
    receiptState === null ? undoHistory.data?.[0]?.id : receiptUndoId;
  const undoReceipt = async () => {
    if (!activeUndoId || undoMutation.isPending) {
      return;
    }
    setUndoFeedback("");
    try {
      await undoMutation.mutateAsync(activeUndoId);
      setReceipt([]);
      setReceiptUndoId(undefined);
      setUndoFeedback(t("assistant.undoSuccess"));
    } catch (error) {
      setUndoFeedback(
        error instanceof Error ? error.message : t("assistant.undoError"),
      );
    }
  };
  return {
    chatMessages,
    photo,
    setPhoto,
    draft,
    setDraft,
    messages,
    receipt,
    undoReceipt,
    undoReceiptAvailable: Boolean(activeUndoId && receipt.length),
    undoPending: undoMutation.isPending,
    undoFeedback,
    sending,
    send,
    proposal,
    applyProposal,
    discardProposal: () => {
      setProposal(null);
      planMutation.reset();
    },
    planError: planMutation.isError,
  };
}
