// node --test ~/.config/herdr-app/mods/journal/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTail, when } from "./model.js";

test("an empty or absent file has no entry", () => {
  assert.deepEqual(parseTail(""), []);
});

test("entries come newest first with their PR link", () => {
  const text = "2026-11-18 03:12  softwarevidal/arthur#41  agent rebase lancé\n2026-11-18 03:31  softwarevidal/arthur#41  ok : CI verte\n";
  assert.deepEqual(parseTail(text), [
    { date: "2026-11-18", time: "03:31", key: "softwarevidal/arthur#41", repo: "softwarevidal/arthur", number: 41, text: "ok : CI verte", url: "https://github.com/softwarevidal/arthur/pull/41" },
    { date: "2026-11-18", time: "03:12", key: "softwarevidal/arthur#41", repo: "softwarevidal/arthur", number: 41, text: "agent rebase lancé", url: "https://github.com/softwarevidal/arthur/pull/41" },
  ]);
});

test("a line without PR has no link", () => {
  assert.deepEqual(parseTail("2026-11-18 03:12  -  surveillance coupée"),
    [{ date: "2026-11-18", time: "03:12", key: null, repo: null, number: null, text: "surveillance coupée", url: null }]);
});

test("a malformed line is skipped", () => {
  assert.deepEqual(parseTail("n'importe quoi\n2026-11-18 03:12  -  ok"), [{ date: "2026-11-18", time: "03:12", key: null, repo: null, number: null, text: "ok", url: null }]);
});

test("when shows the time today, the day before it otherwise", () => {
  assert.equal(when({ date: "2026-11-18", time: "03:12" }, "2026-11-18"), "03:12");
  assert.equal(when({ date: "2026-11-17", time: "22:40" }, "2026-11-18"), "17/11 22:40");
  assert.equal(when({ date: "2025-11-17", time: "22:40" }, "2026-11-18"), "17/11 22:40");
});
