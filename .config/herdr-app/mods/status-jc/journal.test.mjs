// node --test ~/.config/herdr-app/mods/status-jc/journal.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundLines, formatLine } from "./journal.js";

const K = "o/r#1";
const lines = (beforePr, afterPr, toasts = new Map(), on = { before: true, after: true }) =>
  roundLines({ on: on.before, journalOn: on.before, prs: beforePr ? { [K]: beforePr } : {} },
    { on: on.after, prs: afterPr ? { [K]: afterPr } : {} }, toasts);

test("a launch writes the agent step", () => {
  assert.deepEqual(lines({ label: "ok" }, { label: "agent en cours", why: "agent rebase lancé sur 1a2b", launched: { step: "rebase", head: "1a2b" } }),
    [{ key: K, text: "agent rebase lancé" }]);
});

test("two agents in a row under the same label write each launch", () => {
  const before = { label: "agent en cours", launched: { step: "pr-risk", head: "1a2b" } };
  assert.deepEqual(lines(before, { ...before, launched: { step: "pr-review", head: "1a2b" } }), [{ key: K, text: "agent pr-review lancé" }]);
});

test("the end of an agent writes the new label and its why", () => {
  const launched = { step: "rebase", head: "1a2b" };
  assert.deepEqual(lines({ label: "agent en cours", launched }, { label: "ok", why: "CI verte", launched }), [{ key: K, text: "ok : CI verte" }]);
});

test("a label without why is written alone", () => {
  assert.deepEqual(lines({ label: "ok" }, { label: "brouillon" }), [{ key: K, text: "brouillon" }]);
});

test("an unchanged PR writes nothing", () => {
  assert.deepEqual(lines({ label: "ok", why: "a" }, { label: "ok", why: "b" }), []);
});

test("a new PR writes its state, a gone one leaves the watch", () => {
  assert.deepEqual(lines(null, { label: "en attente", why: "CI en cours" }), [{ key: K, text: "en attente : CI en cours" }]);
  assert.deepEqual(lines({ label: "ok" }, null), [{ key: K, text: "sortie de la surveillance" }]);
});

test("a toast is written only when the PR has no other line", () => {
  const toasts = new Map([[K, "PR #1 : jenkins à toi"]]);
  assert.deepEqual(lines({ label: "ok" }, { label: "ok" }, toasts), [{ key: K, text: "PR #1 : jenkins à toi" }]);
  assert.deepEqual(lines({ label: "ok" }, { label: "à toi", why: "jenkins" }, toasts), [{ key: K, text: "à toi : jenkins" }]);
});

test("the watch switched off writes only that", () => {
  assert.deepEqual(lines({ label: "ok" }, { label: "en attente" }, new Map(), { before: true, after: false }), [{ key: null, text: "surveillance coupée" }]);
  assert.deepEqual(lines({ label: "ok" }, { label: "en attente" }, new Map(), { before: false, after: false }), []);
});

test("the watch switched on is written before the PR lines", () => {
  assert.deepEqual(lines({ label: "ok" }, { label: "brouillon" }, new Map(), { before: false, after: true }),
    [{ key: null, text: "surveillance activée" }, { key: K, text: "brouillon" }]);
});

test("no switch line before a first remembered state", () => {
  assert.deepEqual(roundLines({ on: true, prs: {} }, { on: true, prs: {} }, new Map()), []);
});

test("formatLine writes local time, the key and a one-line text", () => {
  assert.equal(formatLine(new Date(2026, 10, 18, 3, 7), K, "x\n  y"), "2026-11-18 03:07  o/r#1  x y");
  assert.equal(formatLine(new Date(2026, 0, 2, 13, 45), null, "surveillance coupée"), "2026-01-02 13:45  -  surveillance coupée");
  assert.equal(formatLine(new Date(2026, 10, 18, 3, 7), K, "merge refusé : a\r\nb\rc"), "2026-11-18 03:07  o/r#1  merge refusé : a b c");
});
