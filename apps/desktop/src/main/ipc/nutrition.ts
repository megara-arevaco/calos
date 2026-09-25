import { ipcMain } from "electron";
import { z } from "zod";
import { respondToChat, type NutritionStore } from "@calos/core";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(2_000);

export function registerNutritionHandlers(store: NutritionStore) {
  ipcMain.handle("nutrition:today", (_event, date: unknown) => store.summary(z.string().date().parse(date)));
  ipcMain.handle("nutrition:delete", (_event, value: unknown) => store.remove(id.parse(value)));
  ipcMain.handle("nutrition:chat", (_event, value: unknown) => respondToChat(text.parse(value), store));
}
