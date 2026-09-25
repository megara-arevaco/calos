import { contextBridge, ipcRenderer } from "electron";
import type { ChatReply, DaySummary } from "@calos/core";

const api = { today: (date: string): Promise<DaySummary> => ipcRenderer.invoke("nutrition:today", date), deleteEntry: (id: string): Promise<void> => ipcRenderer.invoke("nutrition:delete", id), sendMessage: (message: string): Promise<ChatReply> => ipcRenderer.invoke("nutrition:chat", message) };
contextBridge.exposeInMainWorld("calos", api);
export type CalosApi = typeof api;
