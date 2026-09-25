export interface Macros { calories: number; protein: number; carbs: number; fat: number; }
export interface FoodEntry extends Macros { id: string; name: string; quantity: string; meal: "Desayuno" | "Comida" | "Cena" | "Snack"; eatenAt: string; createdAt: string; }
export interface NutritionSnapshot { version: 1; entries: FoodEntry[]; dailyGoal: Macros; }
export interface DaySummary { date: string; total: Macros; entries: FoodEntry[]; }
export interface ChatReply { message: string; entriesAdded: FoodEntry[]; }
