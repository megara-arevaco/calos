import assert from "node:assert/strict";
import { test } from "node:test";
import { ipcContracts } from "../shared/ipc-contracts.js";
import { isTrustedDocument } from "./ipc/document.js";

test("IPC contracts reject unexpected arguments, invalid measures and forged photos", () => {
  assert.equal(
    ipcContracts["nutrition:food-history"].safeParse(["unexpected"]).success,
    false,
  );
  assert.equal(
    ipcContracts["nutrition:waist-save"].safeParse([
      { date: "2026-10-02", centimeters: NaN },
    ]).success,
    false,
  );
  assert.equal(
    ipcContracts["nutrition:weight-save"].safeParse([
      { date: "2026-10-02", kilograms: 99, entries: [] },
    ]).success,
    false,
  );
  assert.equal(
    ipcContracts["nutrition:chat"].safeParse([
      "Hola",
      [],
      { mimeType: "image/png", base64: "aGVsbG8=" },
      undefined,
    ]).success,
    false,
  );
  assert.equal(
    ipcContracts["nutrition:chat"].safeParse([
      "Hola",
      [],
      undefined,
      { date: "2026-10-02", mode: "day", tab: "peso" },
    ]).success,
    true,
  );
  assert.equal(
    ipcContracts["nutrition:chat"].safeParse([
      "Hola",
      [],
      undefined,
      { date: "2026-10-02", mode: "day", tab: "unknown" },
    ]).success,
    false,
  );
});

test("only the exact application document is trusted, allowing fragment navigation", () => {
  assert.equal(
    isTrustedDocument("file:///app/index.html#peso", "file:///app/index.html"),
    true,
  );
  for (const actual of [
    "https://evil.example/",
    "file:///app/other.html",
    "file:///app/index.html?unsafe",
    "file:///app/index.html.evil",
  ]) {
    assert.equal(isTrustedDocument(actual, "file:///app/index.html"), false);
  }
  assert.equal(
    isTrustedDocument("http://localhost:5173/#comida", "http://localhost:5173/"),
    true,
  );
  assert.equal(
    isTrustedDocument("http://localhost:5174/", "http://localhost:5173/"),
    false,
  );
});
