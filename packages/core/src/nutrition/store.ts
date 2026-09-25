import { randomUUID } from "node:crypto";
import { readJson, withFileLock, writeJsonAtomically } from "../shared/persistence.js";
import type { DaySummary, FoodEntry, Macros, NutritionSnapshot } from "./types.js";

const empty = (): NutritionSnapshot => ({ version: 1, entries: [], dailyGoal: { calories: 2200, protein: 140, carbs: 250, fat: 70 } });
const sameDay = (date: string, iso: string) => iso.slice(0, 10) === date;
const add = (items: Macros[]): Macros => items.reduce((a, x) => ({ calories: a.calories + x.calories, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

export class NutritionStore {
  constructor(private readonly filePath: string) {}
  async read(): Promise<NutritionSnapshot> { const data = await readJson(this.filePath, empty()); return data.version === 1 && Array.isArray(data.entries) ? data : empty(); }
  async summary(date: string): Promise<DaySummary> { const entries = (await this.read()).entries.filter((entry) => sameDay(date, entry.eatenAt)); return { date, entries, total: add(entries) }; }
  async add(input: Omit<FoodEntry, "id" | "createdAt">): Promise<FoodEntry> { return withFileLock(this.filePath, async () => { const state = await this.read(); const entry = { ...input, id: randomUUID(), createdAt: new Date().toISOString() }; state.entries.push(entry); await writeJsonAtomically(this.filePath, state); return entry; }); }
  async remove(id: string): Promise<void> { await withFileLock(this.filePath, async () => { const state = await this.read(); state.entries = state.entries.filter((entry) => entry.id !== id); await writeJsonAtomically(this.filePath, state); }); }
}
