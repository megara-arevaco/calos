import type { ChatReply, FoodEntry } from "./types.js";
import type { NutritionStore } from "./store.js";

// Punto único a reemplazar por el cliente del LLM local. Su salida deberá ser FoodEntry[] validada.
const catalogue: Record<string, Omit<FoodEntry, "id" | "createdAt" | "eatenAt" | "meal">> = {
  pollo: { name: "Pechuga de pollo", quantity: "200 g", calories: 330, protein: 62, carbs: 0, fat: 7 },
  arroz: { name: "Arroz cocido", quantity: "150 g", calories: 195, protein: 4, carbs: 42, fat: 1 },
  huevo: { name: "Huevos", quantity: "2 unidades", calories: 144, protein: 13, carbs: 1, fat: 10 },
  avena: { name: "Avena", quantity: "60 g", calories: 228, protein: 8, carbs: 38, fat: 4 },
  yogur: { name: "Yogur griego", quantity: "170 g", calories: 130, protein: 16, carbs: 6, fat: 4 },
  platano: { name: "Plátano", quantity: "1 unidad", calories: 105, protein: 1, carbs: 27, fat: 0 },
};
const mealForHour = (): FoodEntry["meal"] => { const h = new Date().getHours(); return h < 11 ? "Desayuno" : h < 16 ? "Comida" : h < 21 ? "Cena" : "Snack"; };

export async function respondToChat(text: string, store: NutritionStore): Promise<ChatReply> {
  const lower = text.toLocaleLowerCase("es"); const found = Object.entries(catalogue).filter(([key]) => lower.includes(key));
  if (!found.length) return { message: "El conector LLM local todavía no está configurado. Mientras tanto, prueba: «hoy he comido pollo, arroz y yogur».", entriesAdded: [] };
  const now = new Date().toISOString(); const meal = mealForHour();
  const entriesAdded = await Promise.all(found.map(([, food]) => store.add({ ...food, eatenAt: now, meal })));
  const calories = entriesAdded.reduce((total, entry) => total + entry.calories, 0);
  return { message: `He añadido ${entriesAdded.map((entry) => entry.name).join(", ")}: ${calories} kcal en total. Puedes borrar cualquier alimento desde el diario.`, entriesAdded };
}
