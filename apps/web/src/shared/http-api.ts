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
  sendMessage: (id, text, history = [], image, context) =>
    call("nutrition:chat", id, text, history, image, context),
  waistHistory: (id) => call("nutrition:waist-history", id),
  saveWaist: (id, measurement) => call("nutrition:waist-save", id, measurement),
  deleteWaist: (id, measurement) => call("nutrition:waist-delete", id, measurement),
  weightHistory: (id) => call("nutrition:weight-history", id),
  saveWeight: (id, measurement) => call("nutrition:weight-save", id, measurement),
  deleteWeight: (id, measurement) => call("nutrition:weight-delete", id, measurement),
};
