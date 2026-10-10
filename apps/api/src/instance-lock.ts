import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { join, resolve } from "node:path";

interface InstanceLockRecord {
  pid: number;
  token: string;
}

/** Prevent multiple API processes from mutating one installation's data root. */
export async function acquireInstanceLock(
  dataDirectory: string,
): Promise<() => Promise<void>> {
  const root = resolve(dataDirectory);
  const lockPath = join(root, ".calos-api.lock");
  const record: InstanceLockRecord = { pid: process.pid, token: randomUUID() };
  await fs.mkdir(root, { recursive: true });

  let handle: Awaited<ReturnType<typeof fs.open>>;

  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Calos API ya está activa o existe un bloqueo pendiente para este directorio de datos (${lockPath}). Comprueba que la instancia anterior se haya detenido antes de retirar un bloqueo obsoleto.`,
      );
    }
    throw error;
  }

  try {
    await handle.writeFile(JSON.stringify(record));
    await handle.sync();
  } catch (error) {
    await handle.close();
    await fs.rm(lockPath, { force: true });
    throw error;
  }
  await handle.close();

  let released = false;

  return async () => {
    if (released) {
      return;
    }
    released = true;

    try {
      const current = JSON.parse(
        await fs.readFile(lockPath, "utf8"),
      ) as Partial<InstanceLockRecord>;

      if (current.pid === record.pid && current.token === record.token) {
        await fs.rm(lockPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  };
}
