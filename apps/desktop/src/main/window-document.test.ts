import assert from "node:assert/strict";
import { test } from "node:test";
import { windowDocument } from "./window-document.js";

test("packaged windows ignore inherited development URLs for loading and IPC trust", () => {
  const packaged = windowDocument(
    true,
    "/app/index.html",
    "https://untrusted.example/",
  );
  assert.equal(packaged.developmentUrl, undefined);
  assert.equal(packaged.trustedUrl, "file:///app/index.html");
  const development = windowDocument(
    false,
    "/app/index.html",
    "http://localhost:5173/",
  );
  assert.equal(development.developmentUrl, "http://localhost:5173/");
  assert.equal(development.trustedUrl, development.developmentUrl);
});
