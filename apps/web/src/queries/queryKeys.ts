export const queryKeys = {
  plan: (profileId: string) => ["nutrition", profileId, "plan"] as const,
  profiles: ["profiles"] as const,
  days: (profileId: string) => ["nutrition", profileId, "days"] as const,
  day: (profileId: string, date: string) =>
    ["nutrition", profileId, "days", date] as const,
  foodHistory: (profileId: string) => ["nutrition", profileId, "food-history"] as const,
  templates: (profileId: string) => ["nutrition", profileId, "templates"] as const,
  trash: (profileId: string) => ["nutrition", profileId, "trash"] as const,
  undoHistory: (profileId: string) => ["nutrition", profileId, "undo-history"] as const,
  backups: (profileId: string) => ["nutrition", profileId, "backups"] as const,
  retention: (profileId: string) => ["nutrition", profileId, "retention"] as const,
  assistantUsage: () => ["assistant", "usage"] as const,
  measurements: (profileId: string, kind: "waist" | "weight") =>
    ["nutrition", profileId, kind] as const,
};
