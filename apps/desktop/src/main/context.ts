import type { LocalProfiles, OpenRouterConfig } from "@calos/core";

export interface MainContext {
  profiles: LocalProfiles;
  openRouterConfig?: OpenRouterConfig;
}
