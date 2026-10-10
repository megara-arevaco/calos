import type { CalosApi } from "@calos/core";
import type { RpcChannel, RpcInput } from "@calos/core";
import type { ProfileRegistry } from "@calos/core";
import i18n from "../i18n.js";

async function invoke<T>(channel: RpcChannel, args: unknown[]): Promise<T> {
  const response = await fetch(`/api/rpc/${channel}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || i18n.t("common.connectionError"));
  }
  return result.data as T;
}

function selectBrowserProfile(registry: ProfileRegistry, preferred?: string) {
  const selected = preferred ?? localStorage.getItem("calos.activeProfile");
  const activeId = registry.profiles.some((profile) => profile.id === selected)
    ? selected!
    : registry.activeId;

  if (activeId) {
    localStorage.setItem("calos.activeProfile", activeId);
  }
  return { ...registry, activeId };
}

const call = <K extends RpcChannel, T>(channel: K, ...args: RpcInput<K>) =>
  invoke<T>(channel, args);

export const httpApi: CalosApi = {
  aiUsage: () => call("assistant:usage"),
  onboard: (text, history) => call("profiles:onboarding", text, history),
  profiles: async () =>
    selectBrowserProfile(await invoke<ProfileRegistry>("profiles:list", [])),
  createProfile: async (input) => {
    const registry = await invoke<ProfileRegistry>("profiles:create", [input]);
    return selectBrowserProfile(registry, registry.activeId ?? undefined);
  },
  selectProfile: async (id) =>
    selectBrowserProfile(await invoke<ProfileRegistry>("profiles:select", [id]), id),
  nutritionPlan: (id) => call("nutrition:plan", id),
  saveNutritionPlan: (id, plan, previous) =>
    call("nutrition:plan-save", id, plan, previous),
  today: (id, date) => call("nutrition:today", id, date),
  foodHistory: (id) => call("nutrition:food-history", id),
  deleteEntry: (id, entry) => call("nutrition:delete", id, entry),
  undoOperation: (id, operation) => call("nutrition:undo", id, operation),
  undoHistory: (id) => call("nutrition:undo-history", id),
  restoreEntry: (id, entry) => call("nutrition:restore", id, entry),
  deletedEntries: (id) => call("nutrition:trash", id),
  deleteTrashEntry: (id, entry) => call("nutrition:trash-delete", id, entry),
  saveFood: (id, input) => call("nutrition:food-save", id, input),
  repeatEntry: (id, entry, date) => call("nutrition:repeat-entry", id, entry, date),
  templates: (id) => call("nutrition:templates", id),
  saveTemplate: (id, input) => call("nutrition:template-save", id, input),
  updateTemplate: (id, template, expected) =>
    call("nutrition:template-update", id, template, expected),
  repeatTemplate: (id, template, date, servings) =>
    call("nutrition:template-repeat", id, template, date, servings),
  backups: (id) => call("nutrition:backups", id),
  downloadBackup: (id, backup) => call("nutrition:backup-download", id, backup),
  restoreBackup: (id, backup) => call("nutrition:backup-restore", id, backup),
  deleteBackup: (id, backup) => call("nutrition:backup-delete", id, backup),
  retention: (id) => call("nutrition:retention", id),
  saveRetention: (id, value) => call("nutrition:retention-save", id, value),
  exportNutrition: (id) => call("nutrition:export", id),
  importNutrition: (id, snapshot) => call("nutrition:import", id, snapshot),
  sendMessage: (id, text, history = [], image, context) =>
    call("nutrition:chat", id, text, history, image, context),
  waistHistory: (id) => call("nutrition:waist-history", id),
  saveWaist: (id, measurement) => call("nutrition:waist-save", id, measurement),
  deleteWaist: (id, measurement) => call("nutrition:waist-delete", id, measurement),
  weightHistory: (id) => call("nutrition:weight-history", id),
  saveWeight: (id, measurement) => call("nutrition:weight-save", id, measurement),
  deleteWeight: (id, measurement) => call("nutrition:weight-delete", id, measurement),
};
