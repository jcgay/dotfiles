import { test } from "node:test";
import assert from "node:assert/strict";
import { usageWindows, resetLabel } from "./usage.js";

const now = Date.UTC(2026, 10, 24, 10, 0);
const s = (ms) => Math.floor(ms / 1000);

test("both windows, rounded", () => {
  const limits = { five_hour: { used_percentage: 41.6, resets_at: s(now) + 3600 }, seven_day: { used_percentage: 18, resets_at: s(now) + 86400 } };
  assert.deepEqual(usageWindows(limits, now), [
    { name: "5h", pct: 42, reset: s(now) + 3600 },
    { name: "7j", pct: 18, reset: s(now) + 86400 },
  ]);
});

test("a window past its reset is dropped", () => {
  const limits = { five_hour: { used_percentage: 90, resets_at: s(now) - 1 }, seven_day: { used_percentage: 18 } };
  assert.deepEqual(usageWindows(limits, now), [{ name: "7j", pct: 18, reset: null }]);
});

test("nothing to show", () => {
  assert.deepEqual(usageWindows(null, now), []);
  assert.deepEqual(usageWindows({ five_hour: {} }, now), []);
});

test("reset label: time today, date another day", () => {
  const today = new Date(now); today.setHours(14, 5, 0, 0);
  assert.equal(resetLabel(s(today.getTime()), now), "14:05");
  const later = new Date(today); later.setDate(later.getDate() + 3);
  const p = (n) => String(n).padStart(2, "0");
  assert.equal(resetLabel(s(later.getTime()), now), `${p(later.getDate())}/${p(later.getMonth() + 1)} 14:05`);
});
