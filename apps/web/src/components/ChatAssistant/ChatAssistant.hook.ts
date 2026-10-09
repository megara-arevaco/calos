import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, NutritionPlanProposal } from "@calos/core";
import type { PhotoAttachment } from "../NutritionPhotoInput/index.js";
import type { AppView } from "../App/App.hook.js";
import { useChatMutation } from "../../queries/nutrition.queries.js";
import { useSaveNutritionPlan } from "../../queries/plan.queries.js";
import { today } from "../../shared/presentation.js";

export function useChatAssistant(view: AppView, selectedDate: string) {
  const chatMessages = useRef<HTMLDivElement>(null);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hola. Podemos revisar tus comidas, trabajar en los objetivos de tu perfil o preparar un plan que encaje con tu rutina. Cuéntame qué necesitas; también puedes enviar una foto del plato.",
    },
  ]);
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
          text: `He actualizado tus objetivos: ${plan.goal}. ${plan.dailyGoal.calories} kcal al día; proteína ${plan.dailyGoal.protein} g, carbohidratos ${plan.dailyGoal.carbs} g y grasas ${plan.dailyGoal.fat} g.`,
        },
      ]);
    } catch {
      /* Keep proposal and show the error. */
    }
  };
  const sending = mutation.isPending || planMutation.isPending;
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
          ? "Analiza este plato y ayúdame a registrarlo."
          : "Quiero registrar el producto de esta etiqueta nutricional."
        : "");

    if (!message || sending) {
      return;
    }
    setDraft("");
    planMutation.reset();
    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: `${message}${photo ? (photo.image.kind === "plate" ? "\n[Foto de plato adjunta]" : "\n[Foto de etiqueta adjunta]") : ""}`,
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
          text: "No he podido procesar tu mensaje. Prueba de nuevo.",
        },
      ]);
    }
  };
  return {
    chatMessages,
    photo,
    setPhoto,
    draft,
    setDraft,
    messages,
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
