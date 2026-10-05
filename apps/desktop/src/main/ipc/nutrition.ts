import { respondToChat } from "@calos/core";
import type { MainContext } from "../context.js";
import { handle } from "./handle.js";

export function registerNutritionHandlers({ profiles, openRouterConfig }: MainContext) {
  handle("profiles:list", () => profiles.list());
  handle("profiles:create", (_event, input) => profiles.create(input));
  handle("profiles:select", (_event, id) => profiles.select(id));
  handle("nutrition:plan", async (_event, profileId) =>
    (await profiles.store(profileId)).nutritionPlan(),
  );
  handle("nutrition:plan-save", async (_event, profileId, plan, previous) =>
    (await profiles.store(profileId)).saveNutritionPlan(plan, previous),
  );
  handle("nutrition:today", async (_event, profileId, date) =>
    (await profiles.store(profileId)).summary(date),
  );
  handle("nutrition:food-history", async (_event, profileId) =>
    (await profiles.store(profileId)).foodHistory(),
  );
  handle("nutrition:delete", async (_event, profileId, id) =>
    (await profiles.store(profileId)).remove(id),
  );
  handle("nutrition:chat", async (_event, profileId, text, history, image, context) =>
    respondToChat(text, await profiles.store(profileId), {
      config: openRouterConfig,
      history,
      image,
      context,
    }),
  );
  handle("nutrition:waist-history", async (_event, profileId) =>
    (await profiles.store(profileId)).waistHistory(),
  );
  handle("nutrition:waist-save", async (_event, profileId, measurement) =>
    (await profiles.store(profileId)).saveWaist(measurement),
  );
  handle("nutrition:waist-delete", async (_event, profileId, id) =>
    (await profiles.store(profileId)).removeWaist(id),
  );
  handle("nutrition:weight-history", async (_event, profileId) =>
    (await profiles.store(profileId)).weightHistory(),
  );
  handle("nutrition:weight-save", async (_event, profileId, measurement) =>
    (await profiles.store(profileId)).saveWeight(measurement),
  );
  handle("nutrition:weight-delete", async (_event, profileId, id) =>
    (await profiles.store(profileId)).removeWeight(id),
  );
}
