import type { Server } from "node:http";
import { join, resolve } from "node:path";
import { acquireInstanceLock } from "./instance-lock.js";
import { readAiQuotaConfig, readOpenRouterConfig } from "./openrouter-config.js";
import { createApi, profilesAt } from "./server.js";

const dataDirectory = resolve(process.env.CALOS_DATA_DIR ?? "data");
const envFiles = [process.env.CALOS_ENV_FILE ?? ".env"];
const aiQuota = readAiQuotaConfig(envFiles);
const openRouterConfig = readOpenRouterConfig(envFiles);
const releaseInstanceLock = await acquireInstanceLock(dataDirectory);
let server: Server;

try {
  server = await createApi({
    profiles: profilesAt(dataDirectory),
    usagePath: join(dataDirectory, "ai-usage.json"),
    aiQuota,
    openRouterConfig,
  });
} catch (error) {
  await releaseInstanceLock();
  throw error;
}

server.on("error", (error) => {
  console.error("Calos API server error:", error.message);
  server.close(() => {
    void releaseInstanceLock().finally(() => {
      process.exitCode = 1;
    });
  });
});
server.listen(Number(process.env.PORT ?? 3002), process.env.HOST ?? "127.0.0.1");
let closing = false;

const shutdown = () => {
  if (!closing) {
    closing = true;
    server.close((error) => {
      void releaseInstanceLock().then(() => {
        process.exitCode = error ? 1 : 0;
      });
    });
  }
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
