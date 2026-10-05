import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readJson, withFileLock, writeJsonAtomically } from "./persistence.js";

test(
  "nested storage operations and equivalent paths serialize without deadlocks",
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "calos-persistence-"));
    const file = join(directory, "data.json");

    try {
      await writeJsonAtomically(file, { value: 0 });
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          withFileLock(
            i % 2 ? file : resolve(directory, "nested", "..", "data.json"),
            async () => {
              const current = await readJson(file, { value: 0 });
              await withFileLock(file, () =>
                writeJsonAtomically(file, { value: current.value + 1 }),
              );
            },
          ),
        ),
      );
      assert.equal((await readJson(file, { value: 0 })).value, 10);
      assert.equal(await writeJsonAtomically(file, { value: 10 }), false);
      await writeFile(file, "invalid json");
      await assert.rejects(readJson(file, { value: 0 }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
