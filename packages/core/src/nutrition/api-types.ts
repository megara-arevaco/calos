import type { NutritionPlan } from "./plan-schema.js";
import type { UserProfileInput, ProfileRegistry } from "./profile-schema.js";
import type { OnboardingMessage, OnboardingReply } from "./onboarding.js";
import type { RpcArgs } from "./rpc-contracts.js";
import type {
  DeletedFoodEntry,
  FoodEntry,
  FoodTemplate,
  NutritionSnapshot,
  NutritionImportResult,
  NutritionBackup,
  NutritionRetention,
  NutritionUndoReceipt,
  AssistantUsage,
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
  aiUsage(): Promise<AssistantUsage>;
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
  undoOperation(profileId: string, undoId: string): Promise<void>;
  undoHistory(profileId: string): Promise<NutritionUndoReceipt[]>;
  restoreEntry(profileId: string, id: string): Promise<FoodEntry>;
  deletedEntries(profileId: string): Promise<DeletedFoodEntry[]>;
  deleteTrashEntry(profileId: string, id: string): Promise<void>;
  saveFood(
    profileId: string,
    input: RpcArgs<"nutrition:food-save">[1],
  ): Promise<FoodEntry>;
  repeatEntry(profileId: string, id: string, date: string): Promise<FoodEntry>;
  templates(profileId: string): Promise<FoodTemplate[]>;
  saveTemplate(
    profileId: string,
    input: { name: string; entryIds: string[]; baseServings: number },
  ): Promise<FoodTemplate>;
  updateTemplate(
    profileId: string,
    template: FoodTemplate,
    expected: FoodTemplate,
  ): Promise<FoodTemplate>;
  repeatTemplate(
    profileId: string,
    id: string,
    date: string,
    servings: number,
  ): Promise<{ entries: FoodEntry[]; undoId?: string }>;
  backups(profileId: string): Promise<NutritionBackup[]>;
  downloadBackup(
    profileId: string,
    backupId: string,
  ): Promise<{ id: string; snapshot: NutritionSnapshot }>;
  restoreBackup(profileId: string, backupId: string): Promise<NutritionImportResult>;
  deleteBackup(profileId: string, backupId: string): Promise<void>;
  retention(profileId: string): Promise<NutritionRetention>;
  saveRetention(
    profileId: string,
    value: NutritionRetention,
  ): Promise<NutritionRetention>;
  exportNutrition(profileId: string): Promise<NutritionSnapshot>;
  importNutrition(
    profileId: string,
    snapshot: NutritionSnapshot,
  ): Promise<NutritionImportResult>;
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
