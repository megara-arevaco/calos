import { resolve } from "node:path";
import { readOpenRouterConfig } from "./openrouter-config.js";
import { createApi, profilesAt } from "./server.js";

const server = await createApi({
  profiles: profilesAt(resolve(process.env.CALOS_DATA_DIR ?? "data")),
  openRouterConfig: readOpenRouterConfig([process.env.CALOS_ENV_FILE ?? ".env"]),
});
server.listen(Number(process.env.PORT ?? 3002), process.env.HOST ?? "127.0.0.1");
let closing = false;

const shutdown = () => {
  if (!closing) {
    closing = true;
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
  }
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
