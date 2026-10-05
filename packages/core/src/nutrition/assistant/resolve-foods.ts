import { resolveVolumes } from "./volumes.js";
import { localTimestamp } from "../../shared/calendar.js";
import {
  customFood,
  customFoodEntry,
  hasWrittenNutrition,
  normalizeFoodName,
} from "../custom-food.js";
import { labelEntry } from "../label.js";
import { estimatedEntry } from "../estimate.js";
import { foodEntry, searchFoods } from "../catalogue.js";
import { AssistantError, type JsonCompletion } from "../openrouter.js";
import type {
  ChatMessage,
  CustomFood,
  FoodEntry,
  NutritionImage,
  NutritionSnapshot,
} from "../types.js";
import { estimatedFoods, matchedMeal, type ParsedFood } from "./schemas.js";
import { estimationPrompt, matchPrompt } from "./prompts.js";
import { correctionDate, rescaleEntry, applyNutrientPatch } from "./corrections.js";

const mealForHour = (): FoodEntry["meal"] => {
  const hour = new Date().getHours();
  return hour < 11 ? "Desayuno" : hour < 16 ? "Comida" : hour < 21 ? "Cena" : "Snack";
};

export function compatibleDescription(item: ParsedFood, description: string) {
  const requested = normalizeFoodName([item.name, ...item.queries].join(" "));

  if (
    /\b(?:sin aceites?|al natural|en agua|in water|without oil|no oil)\b/.test(
      requested,
    ) &&
    /\bcanned in oil\b/i.test(description)
  ) {
    return false;
  }
  if (
    /\b(?:en lata|canned)\b/.test(requested) &&
    /\btuna\b/i.test(description) &&
    !/\bcanned\b/i.test(description)
  ) {
    return false;
  }
  return true;
}

function compatibleCandidates(item: ParsedFood) {
  return searchFoods(item.queries).filter((food) =>
    compatibleDescription(item, food.description),
  );
}

export interface ResolvedFood {
  item: ParsedFood;
  entry: Omit<FoodEntry, "id" | "createdAt">;
}

export async function resolveFoods(
  foods: ParsedFood[],
  state: NutritionSnapshot,
  text: string,
  history: ChatMessage[],
  image: NutritionImage | undefined,
  complete: JsonCompletion,
  targets = new Map<string, FoodEntry>(),
  estimationAllowed = true,
) {
  const savedFoods: CustomFood[] = [];

  if (image && !foods.some((food) => food.label)) {
    throw new AssistantError(
      "No he podido leer la etiqueta de la foto. Adjunta una imagen clara de la tabla nutricional; no se ha guardado ninguna comida.",
    );
  }
  // Written nutrition can be redundantly copied into label by the model.
  // Use only the separately validated user data when no image was attached.
  if (!image) {
    for (const food of foods) {
      if (food.customNutrition) {
        food.label = null;
      }
    }
  }
  if (!image && foods.some((food) => food.label)) {
    throw new Error("Label without image");
  }

  const volumeEstimates = await resolveVolumes(
    foods,
    complete,
    estimationAllowed,
    targets,
  );
  const now = localTimestamp();
  const resolved: ResolvedFood[] = [];
  const entryDate = (item: ParsedFood) => {
    const target = item.entryId ? targets.get(item.entryId) : undefined;
    return target ? correctionDate(target, item) : now;
  };
  const activeFoods = foods.filter((item) => {
    if (item.keepSource && !item.label && !item.customNutrition && item.entryId) {
      const existing = targets.get(item.entryId);

      if (!existing) {
        throw new Error("Unknown correction target");
      }
      resolved.push({ item, entry: rescaleEntry(existing, item) });
      return false;
    }
    return true;
  });
  resolved.push(
    ...activeFoods
      .filter((food) => food.label)
      .map((item) => ({
        item,
        entry: labelEntry(
          item.label!,
          item,
          item.meal ?? mealForHour(),
          entryDate(item),
        ),
      })),
  );
  for (const item of activeFoods.filter(
    (food) => !food.label && (food.customNutrition || food.customFoodId),
  )) {
    let reference: CustomFood | undefined;

    if (item.customNutrition) {
      const userTexts = [
        text,
        ...(history ?? [])
          .filter((message) => message.role === "user")
          .map((message) => message.text),
      ];
      const existing = state.customFoods.find(
        (food) =>
          food.id === item.customFoodId ||
          normalizeFoodName(food.name) === normalizeFoodName(item.name),
      );

      if (
        userTexts.some(
          (message) =>
            message.includes(item.customNutrition!.evidence) &&
            hasWrittenNutrition(item.customNutrition!, message),
        )
      ) {
        reference = customFood(
          item.name,
          item.customNutrition,
          item.entryId ? undefined : existing,
        );
        if (!item.entryId) {
          savedFoods.push(reference);
        }
      } else {
        // Some models copy stored nutrients instead of returning the catalogue ID.
        // Reuse only an exact saved reference; never accept changed or invented values.
        const supplied = item.customNutrition;
        const matchesSaved =
          existing &&
          (["calories", "protein", "carbs", "fat"] as const).every(
            (key) =>
              Math.abs(
                existing.ranges[key].min -
                  (supplied[key].min * 100) / supplied.basisGrams,
              ) < 1e-8 &&
              Math.abs(
                existing.ranges[key].max -
                  (supplied[key].max * 100) / supplied.basisGrams,
              ) < 1e-8,
          );

        if (!matchesSaved) {
          throw new AssistantError(
            "No he podido verificar los valores que has indicado. Escribe la cantidad de referencia y los cuatro nutrientes; no se ha guardado nada.",
          );
        }
        reference = existing;
      }
    } else {
      reference = state.customFoods.find((food) => food.id === item.customFoodId);
    }
    if (!reference) {
      throw new Error("Unknown custom food");
    }
    if (!item.saveOnly) {
      if (item.grams === null) {
        throw new AssistantError(
          "¿Cuántos gramos has consumido? Usaré los valores que has indicado; todavía no se ha guardado nada.",
        );
      }

      const entry = customFoodEntry(
        reference,
        item.name,
        item.grams,
        item.meal ?? mealForHour(),
        entryDate(item),
      );

      if (
        item.entryId &&
        item.customNutrition &&
        entry.source?.provider === "Datos del usuario"
      ) {
        delete entry.source.customFoodId;
      }
      resolved.push({ item, entry });
    }
  }

  const databaseFoods = activeFoods.filter(
    (food) => !food.label && !food.customNutrition && !food.customFoodId,
  );

  const catalogueFoods = databaseFoods;

  if (catalogueFoods.some((food) => food.saveOnly)) {
    throw new Error("Catalogue save requires user nutrition");
  }

  const missingAmounts = catalogueFoods.filter(
    (food) =>
      food.grams === null &&
      (food.portionCount === null || food.portionDescription === null),
  );

  if (missingAmounts.length) {
    throw new AssistantError(
      `¿Qué cantidad has consumido de ${missingAmounts.map((food) => `«${food.name}»`).join(" y ")}? Puedes indicarla en gramos, mililitros o unidades. Las cantidades de los demás alimentos se conservan; todavía no se ha guardado nada.`,
    );
  }

  const candidates = catalogueFoods.map((food, index) => ({
    index,
    ...food,
    candidates: compatibleCandidates(food),
  }));

  const missing = candidates.filter((item) => !item.candidates.length);

  const estimateCandidates = async (items: typeof candidates) => {
    if (!estimationAllowed) {
      throw new AssistantError(
        `No encuentro una referencia exacta para ${items.map((item) => `«${item.name}»`).join(" y ")}. ¿Puedes aportar su receta con cantidades o sus valores nutricionales? No he guardado una estimación.`,
      );
    }
    if (items.some((item) => item.grams === null)) {
      throw new AssistantError(
        `Puedo estimar ${items.map((item) => `«${item.name}»`).join(" y ")}. ¿Cuántos gramos has consumido?`,
      );
    }

    const supplied = items.filter((item) => item.estimate);

    for (const item of supplied) {
      const original = catalogueFoods[item.index];
      resolved.push({
        item: original,
        entry: estimatedEntry(
          item.estimate!,
          original,
          original.meal ?? mealForHour(),
          entryDate(original),
        ),
      });
    }

    const pending = items.filter((item) => !item.estimate);

    if (!pending.length) {
      return;
    }

    const result = estimatedFoods.parse(
      await complete(
        "meal_estimation",
        estimatedFoods,
        estimationPrompt,
        JSON.stringify({
          foods: pending.map(({ candidates: _candidates, ...item }) => item),
          message: text,
          history,
        }),
      ),
    );

    if (
      result.foods.length !== pending.length ||
      new Set(result.foods.map((food) => food.index)).size !== pending.length
    ) {
      throw new Error("Incomplete estimates");
    }
    for (const estimate of result.foods) {
      const candidate = pending.find((item) => item.index === estimate.index);

      if (!candidate) {
        throw new Error("Unknown estimate index");
      }

      const item = catalogueFoods[candidate.index];
      resolved.push({
        item,
        entry: estimatedEntry(
          estimate.estimate,
          item,
          item.meal ?? mealForHour(),
          entryDate(item),
        ),
      });
    }
  };

  if (missing.length) {
    await estimateCandidates(missing);
  }

  const available = candidates.filter((item) => item.candidates.length);
  let matched = available.length
    ? matchedMeal.parse(
        await complete(
          "meal_matches",
          matchedMeal,
          matchPrompt,
          JSON.stringify(available),
        ),
      )
    : { clarification: null, matches: [] };

  if (matched.clarification && !matched.matches.length && available.length > 1) {
    matched = matchedMeal.parse(
      await complete(
        "meal_match_recovery",
        matchedMeal,
        matchPrompt +
          "\nLa selección anterior no distinguió los alimentos compatibles de los que no tienen referencia. Conserva un match por cada alimento que sí tenga candidato fiable y deja sin match solo los que no lo tengan. No rechaces toda la comida por un plato desconocido.",
        JSON.stringify(available),
      ),
    );
  }

  if (matched.clarification && !matched.matches.length && available.length > 1) {
    throw new AssistantError(
      "No he podido distinguir las referencias de los alimentos de esta comida. Puedes indicar la preparación o registrar el plato que quieres estimar por separado; todavía no he guardado nada.",
    );
  }

  const matchedIndexes = new Set(matched.matches.map((match) => match.index));
  const unmatched = available.filter((item) => !matchedIndexes.has(item.index));

  if (
    matchedIndexes.size !== matched.matches.length ||
    matched.matches.some(
      (match) => !available.some((item) => item.index === match.index),
    ) ||
    (!matched.clarification && unmatched.length)
  ) {
    throw new AssistantError(
      "No se han identificado todos los alimentos. No se ha guardado ninguna comida; prueba con una descripción más precisa.",
    );
  }
  resolved.push(
    ...matched.matches.map((match) => {
      const item = available.find((candidate) => candidate.index === match.index);
      const food = item?.candidates.find(
        (candidate) => candidate.fdcId === match.fdcId,
      );

      if (!item || !food) {
        throw new Error("Unknown dataset record");
      }

      let grams = item.grams;
      let portion: string | undefined;

      if (grams === null) {
        const selectedPortion =
          match.portionIndex === null ? undefined : food.portions[match.portionIndex];

        if (!selectedPortion || item.portionCount === null) {
          throw new Error("Unknown dataset portion");
        }
        grams = (item.portionCount / selectedPortion.amount) * selectedPortion.grams;
        portion = `${item.portionCount} × ${selectedPortion.description}`;
      }

      const original = catalogueFoods[match.index];
      return {
        item: original,
        entry: foodEntry(
          food,
          item.name,
          grams,
          item.meal ?? mealForHour(),
          entryDate(original),
          portion,
        ),
      };
    }),
  );

  if (matched.clarification && unmatched.length) {
    await estimateCandidates(unmatched);
  }

  for (const value of resolved) {
    if (image && value.item.label) {
      value.item.nutrientPatch = null;
    }
    value.entry = applyNutrientPatch(
      value.entry,
      value.item,
      text,
      value.item.entryId ? targets.get(value.item.entryId) : undefined,
    );
    const volume = volumeEstimates.get(value.item);

    if (volume && value.entry.source) {
      value.entry.source = { ...value.entry.source, volumeEstimate: volume };
      value.entry.quantity = `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(volume.milliliters)} ml`;
    }
  }
  resolved.sort((a, b) => foods.indexOf(a.item) - foods.indexOf(b.item));
  return { resolved, savedFoods };
}
