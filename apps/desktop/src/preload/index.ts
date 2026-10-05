import { contextBridge, ipcRenderer } from "electron";
import type {
  NutritionPlan,
  UserProfileInput,
  ProfileRegistry,
  ChatDiaryContext,
  ChatMessage,
  ChatReply,
  DaySummary,
  FoodHistoryDay,
  WaistMeasurement,
  WeightMeasurement,
  NutritionImage,
} from "@calos/core";

import type { IpcChannel, IpcInput } from "../shared/ipc-contracts.js";

const invoke = <K extends IpcChannel>(channel: K, ...args: IpcInput<K>) =>
  ipcRenderer.invoke(channel, ...args);

const api = {
  profiles: (): Promise<ProfileRegistry> => invoke("profiles:list"),
  createProfile: (input: UserProfileInput): Promise<ProfileRegistry> =>
    invoke("profiles:create", input),
  selectProfile: (id: string): Promise<ProfileRegistry> =>
    invoke("profiles:select", id),
  nutritionPlan: (profileId: string): Promise<NutritionPlan> =>
    invoke("nutrition:plan", profileId),
  saveNutritionPlan: (
    profileId: string,
    plan: NutritionPlan,
    previous: NutritionPlan,
  ): Promise<NutritionPlan> => invoke("nutrition:plan-save", profileId, plan, previous),
  today: (profileId: string, date: string): Promise<DaySummary> =>
    invoke("nutrition:today", profileId, date),
  foodHistory: (profileId: string): Promise<FoodHistoryDay[]> =>
    invoke("nutrition:food-history", profileId),
  deleteEntry: (profileId: string, id: string): Promise<void> =>
    invoke("nutrition:delete", profileId, id),
  sendMessage: (
    profileId: string,
    message: string,
    history: ChatMessage[] = [],
    image?: NutritionImage,
    context?: ChatDiaryContext,
  ): Promise<ChatReply> =>
    invoke("nutrition:chat", profileId, message, history, image, context),
  waistHistory: (profileId: string): Promise<WaistMeasurement[]> =>
    invoke("nutrition:waist-history", profileId),
  saveWaist: (
    profileId: string,
    measurement: Pick<WaistMeasurement, "date" | "centimeters">,
  ): Promise<WaistMeasurement> =>
    invoke("nutrition:waist-save", profileId, measurement),
  deleteWaist: (profileId: string, id: string): Promise<void> =>
    invoke("nutrition:waist-delete", profileId, id),
  weightHistory: (profileId: string): Promise<WeightMeasurement[]> =>
    invoke("nutrition:weight-history", profileId),
  saveWeight: (
    profileId: string,
    measurement: Pick<WeightMeasurement, "date" | "kilograms">,
  ): Promise<WeightMeasurement> =>
    invoke("nutrition:weight-save", profileId, measurement),
  deleteWeight: (profileId: string, id: string): Promise<void> =>
    invoke("nutrition:weight-delete", profileId, id),
};
contextBridge.exposeInMainWorld("calos", api);
export type CalosApi = typeof api;
