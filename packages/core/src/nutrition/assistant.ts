import { respondToCoach } from "./assistant/coach.js";
import { claimsMutation } from "./assistant/receipt.js";
import { respondToPlate } from "./assistant/plate.js";
import { resolveFoods, compatibleDescription } from "./assistant/resolve-foods.js";
import { correctionTargets } from "./assistant/corrections.js";
import { NutritionConflictError } from "./errors.js";
import { parsedMeal } from "./assistant/schemas.js";
import { parsePrompt, correctionPrompt } from "./assistant/prompts.js";
import { buildChatContext } from "./assistant/context.js";
import { estimateNotice } from "./estimate.js";
import { normalizeFoodName } from "./custom-food.js";
import {
  AssistantError,
  createOpenRouterClient,
  type JsonCompletion,
  type OpenRouterConfig,
} from "./openrouter.js";
import type {
  ChatDiaryContext,
  ChatMessage,
  ChatReply,
  FoodEntry,
  NutritionImage,
} from "./types.js";
import { type NutritionStore } from "./store.js";

export interface AssistantOptions {
  config?: OpenRouterConfig;
  complete?: JsonCompletion;
  history?: ChatMessage[];
  image?: NutritionImage;
  context?: ChatDiaryContext;
}

export async function respondToChat(
  text: string,
  store: NutritionStore,
  options: AssistantOptions = {},
): Promise<ChatReply> {
  const reply = (message: string): ChatReply => ({ message, entriesAdded: [] });

  if (!options.complete && !options.config?.apiKey) {
    return reply(
      "Configura OPENROUTER_API_KEY en el archivo .env y reinicia Calos para activar el asistente.",
    );
  }

  const complete = options.complete ?? createOpenRouterClient(options.config!);
  const state = await store.read();
  const { profileContext, ...chatContext } = buildChatContext(state, options.context);
  const exactRequest =
    /\b(?:no estimes|no quiero (?:que estimes|estimaciones|aproximaciones|valores aproximados)|sin estimaciones|sin aproximaciones|(?:datos|valores|calculo) exactos?)\b/;
  const estimateRequest =
    /\b(?:estima|estimalo|estimala|puedes estimar|permite estimaciones|acepto (?:una )?estimacion|aproximado|aproximada)\b/;
  const preference = [
    ...(options.history ?? [])
      .filter((message) => message.role === "user")
      .map((message) => message.text),
    text,
  ]
    .map(normalizeFoodName)
    .reverse()
    .find((message) => exactRequest.test(message) || estimateRequest.test(message));
  const estimationAllowed = !preference || !exactRequest.test(preference);

  let coaching = false;

  try {
    if (options.image?.kind === "plate") {
      return await respondToPlate(
        text,
        store,
        state,
        complete,
        options.image,
        options.history ?? [],
        options.context,
        chatContext,
        profileContext,
        estimationAllowed,
      );
    }

    let parsed = parsedMeal.parse(
      await complete(
        "meal_interpretation",
        parsedMeal,
        parsePrompt + profileContext,
        JSON.stringify({
          customFoods: state.customFoods,
          estimationAllowed,
          ...chatContext,
          history: options.history ?? [],
          message: text,
        }),
        options.image,
      ),
    );

    if (parsed.action === "coach") {
      coaching = true;
      return await respondToCoach(
        text,
        state,
        complete,
        options.history ?? [],
        profileContext,
        {
          tabContext: { tab: chatContext.tabContext.tab },
          selectedDay: chatContext.diaryContext?.selectedDay,
          selectedDate: options.context?.date,
        },
        options.context?.goalDraft,
      );
    }

    const isCorrection =
      parsed.action === "correct" || parsed.foods.some((food) => food.entryId !== null);

    const needsCorrectionPlan =
      isCorrection &&
      (parsed.clarification !== null ||
        !parsed.foods.length ||
        parsed.foods.some((item) => {
          if (
            item.nutrientPatch &&
            (!text.includes(item.nutrientPatch.evidence) ||
              !/\d|\bcero\b/i.test(item.nutrientPatch.evidence))
          ) {
            return true;
          }

          const existing = state.entries.find((entry) => entry.id === item.entryId);
          return (
            item.keepSource &&
            existing?.source?.provider === "USDA FoodData Central" &&
            !compatibleDescription(item, existing.source.description)
          );
        }));

    if (needsCorrectionPlan) {
      parsed = parsedMeal.parse(
        await complete(
          "meal_correction",
          parsedMeal,
          correctionPrompt,
          JSON.stringify({
            customFoods: state.customFoods,
            estimationAllowed,
            ...chatContext,
            history: options.history ?? [],
            message: text,
          }),
          options.image,
        ),
      );
    }
    if (parsed.clarification) {
      if (claimsMutation(parsed.clarification)) {
        return reply(
          "No he aplicado cambios. Indica qué registro quieres corregir y cómo debe quedar.",
        );
      }
      return reply(parsed.clarification);
    }
    if (parsed.action === "answer") {
      return reply(
        "No he aplicado cambios. Indica qué registro quieres corregir o qué cantidad quieres añadir.",
      );
    }
    if (!parsed.foods.length) {
      return reply(
        parsed.action === "correct"
          ? "Indica qué registro quieres corregir; no he aplicado cambios."
          : "Cuéntame qué has comido y la cantidad para registrarlo.",
      );
    }

    const targets = isCorrection
      ? correctionTargets(parsed.foods, state)
      : new Map<string, FoodEntry>();
    const { resolved, savedFoods } = await resolveFoods(
      parsed.foods,
      state,
      text,
      options.history ?? [],
      options.image,
      complete,
      targets,
      estimationAllowed,
    );

    if (isCorrection) {
      if (!resolved.length && !savedFoods.length) {
        throw new AssistantError(
          "No he identificado valores nuevos para corregir. No he aplicado cambios.",
        );
      }

      const updates = resolved.map(({ item, entry }) => ({
        before: targets.get(item.entryId!)!,
        after: entry,
      }));
      const updated = await store.correctFoods(
        updates,
        savedFoods,
        state.customFoods.filter((food) =>
          savedFoods.some((saved) => saved.id === food.id),
        ),
      );
      const receipts = updated.map(
        (entry) =>
          `${entry.name}: ${entry.quantity}, ${entry.calories} kcal · P ${entry.protein} g · C ${entry.carbs} g · G ${entry.fat} g`,
      );
      return {
        message: `He corregido ${receipts.length ? receipts.join("; ") : "la referencia personal"}. ${savedFoods.length ? "La referencia y todos sus consumos vinculados se han recalculado. " : ""}Los totales del diario y el historial están actualizados.${estimateNotice(updated)}`,
        entriesAdded: [],
        entriesUpdated: updated,
        dataChanged: true,
      };
    }

    const entriesAdded = await store.addMany(
      resolved.map((item) => item.entry),
      savedFoods,
    );
    const catalogueMessage = savedFoods.length
      ? `He guardado ${savedFoods.map((food) => food.name).join(", ")} en tu base de datos personal para reutilizarlo. `
      : "";
    const approximate = [
      ...savedFoods,
      ...entriesAdded.flatMap((entry) =>
        entry.source?.provider === "Datos del usuario"
          ? [{ ranges: entry.source.ranges }]
          : [],
      ),
    ].some((food) =>
      Object.values(food.ranges).some((range) => range.min !== range.max),
    );
    const estimateMessage = approximate
      ? " Los valores son aproximados: uso el punto medio de los rangos que has indicado y conservo los rangos originales."
      : "";

    if (!entriesAdded.length) {
      return {
        ...reply(
          (catalogueMessage ||
            "La referencia ya está guardada en tu base de datos personal. No he añadido ninguna comida.") +
            estimateMessage,
        ),
        dataChanged: savedFoods.length > 0,
      };
    }

    const sources = [
      ...new Set(entriesAdded.map((entry) => entry.source?.provider)),
    ].join(" y ");
    const calories = entriesAdded.reduce((sum, entry) => sum + entry.calories, 0);
    return {
      message: `${catalogueMessage}He registrado ${entriesAdded.map((entry) => `${entry.name}: ${entry.quantity}`).join("; ")}. Total: ${calories} kcal, calculadas con ${sources}. Puedes revisar la fuente en cada registro.${estimateMessage}${estimateNotice(entriesAdded)}`,
      entriesAdded,
    };
  } catch (error) {
    return reply(
      error instanceof AssistantError || error instanceof NutritionConflictError
        ? coaching
          ? error.message.replace(
              "No se ha guardado ninguna comida",
              "No se han cambiado tus objetivos",
            )
          : error.message
        : coaching
          ? "No he podido validar la respuesta sobre tus objetivos. No se han aplicado cambios; prueba de nuevo."
          : "No se ha podido validar la comida. No se ha guardado ningún registro; prueba con alimentos y cantidades más concretos.",
    );
  }
}
