import type { NutritionPlan } from "./plan-schema.js";
import type { UserProfileInput, ProfileRegistry } from "./profile-schema.js";
import type { OnboardingMessage, OnboardingReply } from "./onboarding.js";
import type {
  ChatDiaryContext,
  ChatMessage,
  ChatReply,
  DaySummary,
  FoodHistoryDay,
  WaistMeasurement,
  WeightMeasurement,
  NutritionImage,
} from "./types.js";

export interface CalosApi {
  profiles(): Promise<ProfileRegistry>;
  onboard(text: string, history: OnboardingMessage[]): Promise<OnboardingReply>;
  createProfile(input: UserProfileInput): Promise<ProfileRegistry>;
  selectProfile(id: string): Promise<ProfileRegistry>;
  nutritionPlan(profileId: string): Promise<NutritionPlan>;
  saveNutritionPlan(
    profileId: string,
    plan: NutritionPlan,
    previous: NutritionPlan,
  ): Promise<NutritionPlan>;
  today(profileId: string, date: string): Promise<DaySummary>;
  foodHistory(profileId: string): Promise<FoodHistoryDay[]>;
  deleteEntry(profileId: string, id: string): Promise<void>;
  sendMessage(
    profileId: string,
    message: string,
    history?: ChatMessage[],
    image?: NutritionImage,
    context?: ChatDiaryContext,
  ): Promise<ChatReply>;
  waistHistory(profileId: string): Promise<WaistMeasurement[]>;
  saveWaist(
    profileId: string,
    measurement: Pick<WaistMeasurement, "date" | "centimeters">,
  ): Promise<WaistMeasurement>;
  deleteWaist(profileId: string, id: string): Promise<void>;
  weightHistory(profileId: string): Promise<WeightMeasurement[]>;
  saveWeight(
    profileId: string,
    measurement: Pick<WeightMeasurement, "date" | "kilograms">,
  ): Promise<WeightMeasurement>;
  deleteWeight(profileId: string, id: string): Promise<void>;
}
