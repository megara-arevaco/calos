import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const queues = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queues.set(filePath, next);
  try { return await next; } finally { if (queues.get(filePath) === next) queues.delete(filePath); }
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}

export async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(temporary, filePath); }
  finally { await fs.rm(temporary, { force: true }); }
}
