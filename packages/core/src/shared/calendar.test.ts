import assert from "node:assert/strict";
import { test } from "node:test";
import { localDate, localTimestamp } from "./calendar.js";

test("local calendar and meal timestamp preserve the diary day across UTC midnight", () => {
  const date = new Date("2026-10-01T22:15:00Z");
  date.getFullYear = () => 2026;
  date.getMonth = () => 9;
  date.getDate = () => 2;
  date.getTimezoneOffset = () => -120;
  assert.equal(localDate(date), "2026-10-02");
  assert.equal(localTimestamp(date), "2026-10-02T00:15:00.000+02:00");
  assert.equal(Date.parse(localTimestamp(date)), date.getTime());
  date.getTimezoneOffset = () => 300;
  assert.equal(localTimestamp(date), "2026-10-01T17:15:00.000-05:00");
  assert.equal(Date.parse(localTimestamp(date)), date.getTime());
});
