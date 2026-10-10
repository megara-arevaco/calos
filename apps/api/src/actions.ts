import {
  createOpenRouterClient,
  respondToChat,
  respondToOnboarding,
} from "@calos/core";
import { join } from "node:path";
import { AiQuotaStore } from "./ai-quota.js";
import type { ApiContext } from "./context.js";
import type { RpcArgs, RpcChannel } from "@calos/core";

export function createNutritionActions({
  profiles,
  openRouterConfig,
  aiQuota,
  usagePath,
}: ApiContext) {
  const usage = new AiQuotaStore(
    usagePath ?? join(process.cwd(), "data", "ai-usage.json"),
    aiQuota,
  );
  const complete = openRouterConfig
    ? usage.completion(createOpenRouterClient(openRouterConfig))
    : undefined;
  return {
    "assistant:usage": () => usage.status(),
    "profiles:list": () => profiles.list(),
    "profiles:create": (input) => profiles.create(input),
    "profiles:onboarding": (text, history) =>
      respondToOnboarding(text, history, openRouterConfig, complete),
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
    "nutrition:undo": async (profileId, undoId) =>
      (await profiles.store(profileId)).undo(undoId),
    "nutrition:undo-history": async (profileId) =>
      (await profiles.store(profileId)).undoHistory(),
    "nutrition:restore": async (profileId, id) =>
      (await profiles.store(profileId)).restore(id),
    "nutrition:trash": async (profileId) =>
      (await profiles.store(profileId)).deletedEntries(),
    "nutrition:trash-delete": async (profileId, id) =>
      (await profiles.store(profileId)).deleteTrashEntry(id),
    "nutrition:food-save": async (profileId, input) =>
      (await profiles.store(profileId)).saveManualEntry({
        ...(input.entryId ? { entryId: input.entryId, expected: input.expected! } : {}),
        name: input.name,
        quantity: input.quantity,
        meal: input.meal,
        date: input.date,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        provider: input.provider,
        evidence: input.evidence,
      }),
    "nutrition:repeat-entry": async (profileId, id, date) =>
      (await profiles.store(profileId)).repeatEntry(id, date),
    "nutrition:templates": async (profileId) =>
      (await profiles.store(profileId)).templates(),
    "nutrition:template-save": async (profileId, input) =>
      (await profiles.store(profileId)).saveTemplate(
        input.name,
        input.entryIds,
        input.baseServings,
      ),
    "nutrition:template-update": async (profileId, template, expected) =>
      (await profiles.store(profileId)).updateTemplate(template, expected),
    "nutrition:template-repeat": async (profileId, id, date, servings) =>
      (await profiles.store(profileId)).repeatTemplateWithUndo(id, date, servings),
    "nutrition:backups": async (profileId) =>
      (await profiles.store(profileId)).backups(),
    "nutrition:backup-download": async (profileId, backupId) =>
      (await profiles.store(profileId)).downloadBackup(backupId),
    "nutrition:backup-restore": async (profileId, backupId) =>
      (await profiles.store(profileId)).restoreBackup(backupId),
    "nutrition:backup-delete": async (profileId, backupId) =>
      (await profiles.store(profileId)).deleteBackup(backupId),
    "nutrition:retention": async (profileId) =>
      (await profiles.store(profileId)).retentionSettings(),
    "nutrition:retention-save": async (profileId, retention) =>
      (await profiles.store(profileId)).saveRetentionSettings(retention),
    "nutrition:export": (profileId) => profiles.exportNutrition(profileId),
    "nutrition:import": (profileId, snapshot) =>
      profiles.importNutrition(profileId, snapshot),
    "nutrition:chat": async (profileId, text, history, image, context) =>
      respondToChat(text, await profiles.store(profileId), {
        config: openRouterConfig,
        complete,
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
