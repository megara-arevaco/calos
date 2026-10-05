export const queryKeys = {
  plan: (profileId: string) => ["nutrition", profileId, "plan"] as const,
  profiles: ["profiles"] as const,
  days: (profileId: string) => ["nutrition", profileId, "days"] as const,
  day: (profileId: string, date: string) =>
    ["nutrition", profileId, "days", date] as const,
  foodHistory: (profileId: string) => ["nutrition", profileId, "food-history"] as const,
  measurements: (profileId: string, kind: "waist" | "weight") =>
    ["nutrition", profileId, kind] as const,
};
