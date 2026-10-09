import type { LocalProfiles, OpenRouterConfig } from "@calos/core";

export interface ApiContext {
  profiles: LocalProfiles;
  openRouterConfig?: OpenRouterConfig;
}
