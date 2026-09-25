import { app, BrowserWindow, dialog, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NutritionStore } from "@calos/core";
import { registerNutritionHandlers } from "./ipc/nutrition.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const createWindow = () => {
  const window = new BrowserWindow({ width: 1280, height: 820, minWidth: 920, minHeight: 620, backgroundColor: "#f7f9f8", titleBarStyle: "hiddenInset", webPreferences: { preload: path.join(directory, "../preload/index.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const url = process.env.ELECTRON_RENDERER_URL;
  if (url) void window.loadURL(url); else void window.loadFile(path.join(directory, "../renderer/index.html"));
};
app.whenReady().then(() => { session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false)); registerNutritionHandlers(new NutritionStore(path.join(app.getPath("userData"), "nutrition.json"))); createWindow(); app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); }).catch((error) => { dialog.showErrorBox("No se pudo iniciar Calos", error instanceof Error ? error.message : String(error)); app.quit(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
