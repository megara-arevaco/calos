import { respondToChat, respondToOnboarding } from "@calos/core";
import type { ApiContext } from "./context.js";
import type { RpcArgs, RpcChannel } from "@calos/core";

export function createNutritionActions({ profiles, openRouterConfig }: ApiContext) {
  return {
    "profiles:list": () => profiles.list(),
    "profiles:create": (input) => profiles.create(input),
    "profiles:onboarding": (text, history) =>
      respondToOnboarding(text, history, openRouterConfig),
    "profiles:select": (id) => profiles.select(id),
    "nutrition:plan": async (profileId) =>
      (await profiles.store(profileId)).nutritionPlan(),
    "nutrition:plan-save": async (profileId, plan, previous) =>
      (await profiles.store(profileId)).saveNutritionPlan(plan, previous),
    "nutrition:today": async (profileId, date) =>
      (await profiles.store(profileId)).summary(date),
    "nutrition:food-history": async (profileId) =>
      (await profiles.store(profileId)).foodHistory(),
    "nutrition:delete": async (profileId, id) =>
      (await profiles.store(profileId)).remove(id),
    "nutrition:chat": async (profileId, text, history, image, context) =>
      respondToChat(text, await profiles.store(profileId), {
        config: openRouterConfig,
        history,
        image,
        context,
      }),
    "nutrition:waist-history": async (profileId) =>
      (await profiles.store(profileId)).waistHistory(),
    "nutrition:waist-save": async (profileId, measurement) =>
      (await profiles.store(profileId)).saveWaist(measurement),
    "nutrition:waist-delete": async (profileId, id) =>
      (await profiles.store(profileId)).removeWaist(id),
    "nutrition:weight-history": async (profileId) =>
      (await profiles.store(profileId)).weightHistory(),
    "nutrition:weight-save": async (profileId, measurement) =>
      (await profiles.store(profileId)).saveWeight(measurement),
    "nutrition:weight-delete": async (profileId, id) =>
      (await profiles.store(profileId)).removeWeight(id),
  } satisfies { [K in RpcChannel]: (...args: RpcArgs<K>) => unknown };
}
