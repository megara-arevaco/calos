import { app, BrowserWindow, dialog, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalProfiles } from "@calos/core";
import { registerNutritionHandlers } from "./ipc/nutrition.js";
import { windowDocument } from "./window-document.js";
import { trustWindow } from "./ipc/handle.js";
import { readOpenRouterConfig } from "./openrouter-config.js";
import appIcon from "../renderer/public/branding/calos-icon-256.png?asset";

const directory = path.dirname(fileURLToPath(import.meta.url));

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: "#f7f9f8",
    icon: appIcon,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(directory, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const rendererFile = path.join(directory, "../renderer/index.html");
  const { developmentUrl: url, trustedUrl } = windowDocument(
    app.isPackaged,
    rendererFile,
    process.env.ELECTRON_RENDERER_URL,
  );
  trustWindow(window, trustedUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (url) {
    void window.loadURL(url);
  } else {
    void window.loadFile(rendererFile);
  }
};
app
  .whenReady()
  .then(() => {
    if (process.platform === "darwin") {
      app.dock?.setIcon(appIcon);
    }
    session.defaultSession.setPermissionRequestHandler((_w, _p, callback) =>
      callback(false),
    );
    const configFiles = process.env.CALOS_ENV_FILE
      ? [process.env.CALOS_ENV_FILE]
      : [
          ...(!app.isPackaged ? [path.resolve(app.getAppPath(), "../../.env")] : []),
          path.join(app.getPath("userData"), "openrouter.env"),
        ];
    registerNutritionHandlers({
      profiles: new LocalProfiles(app.getPath("userData")),
      openRouterConfig: readOpenRouterConfig(configFiles),
    });
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    dialog.showErrorBox(
      "No se pudo iniciar Calos",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
