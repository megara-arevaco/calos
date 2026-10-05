import type { NutritionObjectives, NutritionPlanProposal } from "./plan-schema.js";
import type { PlateDraft } from "./plate-schema.js";
export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroRanges {
  calories: { min: number; max: number };
  protein: { min: number; max: number };
  carbs: { min: number; max: number };
  fat: { min: number; max: number };
}

export interface CustomFood {
  id: string;
  name: string;
  per100g: Macros;
  ranges: MacroRanges;
  evidence: string;
  createdAt: string;
}

type NutritionReference =
  | {
      provider: "Estimación";
      basis: "100g";
      perBasis: Macros;
      amount: number;
      unit: "g";
      evidence: string;
      assumptions: string[];
    }
  | {
      provider: "USDA FoodData Central";
      dataset: "SR Legacy 2018-04";
      fdcId: number;
      description: string;
      grams: number;
      portion?: string;
    }
  | {
      provider: "Etiqueta nutricional";
      basis: "100g" | "100ml" | "serving";
      perBasis: Macros;
      amount: number;
      unit: "g" | "ml" | "ración";
      evidence: string;
    }
  | {
      provider: "Datos del usuario";
      customFoodId?: string;
      basis: "100g" | "100ml" | "serving";
      perBasis: Macros;
      ranges: MacroRanges;
      amount: number;
      unit: "g" | "ml" | "ración";
      evidence: string;
    };

export type NutritionSource = NutritionReference & {
  volumeEstimate?: {
    milliliters: number;
    gramsPerMilliliter: number;
    assumption: string;
  };
  photoEstimate?: { estimatedGrams: boolean; assumptions: string[] };
};

export interface NutritionImage {
  kind?: "label" | "plate";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

export interface FoodEntry extends Macros {
  id: string;
  name: string;
  quantity: string;
  meal: "Desayuno" | "Comida" | "Cena" | "Snack";
  eatenAt: string;
  createdAt: string;
  source?: NutritionSource;
}

export interface ChatMessage {
  role: "assistant" | "user";
  text: string;
}

export interface ChatDiaryContext {
  date: string;
  mode: "day" | "history";
  tab?: "comida" | "cintura" | "peso" | "asistente";
  plateDraft?: PlateDraft;
  goalDraft?: NutritionPlanProposal;
}

export interface WaistMeasurement {
  id: string;
  date: string;
  centimeters: number;
  createdAt: string;
}

export interface WeightMeasurement {
  id: string;
  date: string;
  kilograms: number;
  createdAt: string;
}

export interface NutritionProfile {
  name?: string;
  age?: number;
  activity?: "low" | "moderate" | "high";
  dietaryPreferences?: string;
  assistantInstructions?: string;
  heightCm: number;
  weightKg: number;
  goal: string;
}

export interface NutritionSnapshot {
  version: 1;
  objectives?: NutritionObjectives;
  entries: FoodEntry[];
  customFoods: CustomFood[];
  dailyGoal: Macros;
  waistMeasurements: WaistMeasurement[];
  weightMeasurements: WeightMeasurement[];
  profile: NutritionProfile | null;
}

export interface DaySummary {
  date: string;
  total: Macros;
  entries: FoodEntry[];
  dailyGoal: Macros;
}

export interface FoodHistoryDay {
  date: string;
  total: Macros;
  entryCount: number;
}

export interface ChatReply {
  goalProposal?: NutritionPlanProposal;
  plateDraft?: PlateDraft;
  clearPhoto?: boolean;
  message: string;
  entriesAdded: FoodEntry[];
  entriesUpdated?: FoodEntry[];
  dataChanged?: boolean;
}
