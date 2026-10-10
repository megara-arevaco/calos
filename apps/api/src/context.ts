import type { LocalProfiles, OpenRouterConfig } from "@calos/core";
import type { AiQuotaConfig } from "./ai-quota.js";

export interface ApiContext {
  profiles: LocalProfiles;
  openRouterConfig?: OpenRouterConfig;
  aiQuota?: Partial<AiQuotaConfig>;
  usagePath?: string;
}
