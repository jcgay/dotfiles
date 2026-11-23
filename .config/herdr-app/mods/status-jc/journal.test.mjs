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

test("urgentLines: numbers the urgent lines of a write, keeps the newest", async () => {
  const { urgentLines, urgent } = await import("./journal.js");
  assert.equal(urgent("à toi : Jenkins encore en échec"), true);
  assert.equal(urgent("merge refusé : conflit"), true);
  assert.equal(urgent("agent qa lancé"), false);
  const entries = [{ text: "agent qa lancé" }, { text: "à toi : x" }, { text: "erreur : gh" }];
  assert.deepEqual(urgentLines([3], entries, 10), [3, 9, 10]);
  // A file recreated shorter: older numbers past its start are dropped.
  assert.deepEqual(urgentLines([40], [{ text: "à toi" }], 1), [1]);
  assert.deepEqual(urgentLines([1, 2], [{ text: "à toi" }], 3, 2), [2, 3]);
});

test("roundLines: a PR flapping between two labels is written once each, an urgent line always", () => {
  const draft = { label: "brouillon", why: "CI verte", head: "a" }, busy = { label: "agent en cours", why: "un autre onglet", head: "a" };
  const on = { on: true, journalOn: true };
  let reg = { ...on, prs: { [K]: { ...draft } } };
  const step = (next) => {
    const after = { on: true, prs: { [K]: { ...next, logged: reg.prs[K].logged } } };
    const out = roundLines(reg, after, new Map());
    reg = { ...on, prs: after.prs };
    return out.map((l) => l.text);
  };
  assert.deepEqual(step(busy), ["agent en cours : un autre onglet"]);
  assert.deepEqual(step(draft), ["brouillon : CI verte"]);
  assert.deepEqual(step(busy), []);
  assert.deepEqual(step(draft), []);
  assert.deepEqual(step({ label: "à toi", why: "x", head: "a" }), ["à toi : x"]);
  assert.deepEqual(step(draft), ["brouillon : CI verte"]);
  assert.deepEqual(step({ label: "à toi", why: "x", head: "a" }), ["à toi : x"]);
});

test("roundLines: a real return to a label (new push, agent launched in between) is written", () => {
  const ok = { label: "ok", why: "CI verte", head: "a" }, ci = { label: "en attente", why: "CI en cours", head: "b" };
  const on = { on: true, journalOn: true };
  let reg = { ...on, prs: { [K]: { ...ok } } };
  const step = (next) => {
    const after = { on: true, prs: { [K]: { ...next, logged: reg.prs[K].logged } } };
    const out = roundLines(reg, after, new Map());
    reg = { ...on, prs: after.prs };
    return out.map((l) => l.text);
  };
  assert.deepEqual(step(ci), ["en attente : CI en cours"]);
  assert.deepEqual(step({ ...ok, head: "b" }), ["ok : CI verte"]);
  assert.deepEqual(step({ ...ok, head: "b", launched: { step: "pr-review", head: "b" } }), ["agent pr-review lancé"]);
  assert.deepEqual(step({ ...ci, label: "agent en cours", launched: { step: "pr-review", head: "b" } }), ["agent en cours : CI en cours"]);
  assert.deepEqual(step({ ...ok, head: "b", launched: { step: "pr-review", head: "b" } }), ["ok : CI verte"]);
});

test("roundLines: the return from a pause is written", () => {
  const ok = { label: "ok", why: "CI verte", head: "a" }, pause = { label: "en pause", why: "en pause ; CI verte", head: "a" };
  const on = { on: true, journalOn: true };
  let reg = { ...on, prs: { [K]: { ...ok } } };
  const step = (next) => {
    const after = { on: true, prs: { [K]: { ...next, logged: reg.prs[K].logged } } };
    const out = roundLines(reg, after, new Map());
    reg = { ...on, prs: after.prs };
    return out.map((l) => l.text);
  };
  assert.deepEqual(step(pause), ["en pause ; CI verte"]);
  assert.deepEqual(step(ok), ["ok : CI verte"]);
  assert.deepEqual(step(pause), ["en pause ; CI verte"]);
  assert.deepEqual(step(ok), ["ok : CI verte"]);
});

test("roundLines: a why that starts with the label does not repeat it", () => {
  const out = roundLines({ on: true, journalOn: true, prs: {} }, { on: true, prs: { [K]: { label: "en pause", why: "en pause ; CI verte" } } }, new Map());
  assert.deepEqual(out.map((l) => l.text), ["en pause ; CI verte"]);
});

test("roundLines: a PR's GitHub error is written on its second round only, its return to the same state never", () => {
  const ok = { label: "ok", why: "CI verte", head: "a" };
  const err = (n) => ({ label: "erreur", why: "lecture de la PR sur GitHub impossible", head: "a", errorRounds: n });
  const on = { on: true, journalOn: true };
  let reg = { ...on, prs: { [K]: { ...ok, logged: [{ text: "ok : CI verte", head: "a", launch: false }] } } };
  const step = (next) => {
    const after = { on: true, prs: { [K]: { ...next, logged: reg.prs[K].logged } } };
    const out = roundLines(reg, after, new Map());
    reg = { ...on, prs: after.prs };
    return out.map((l) => l.text);
  };
  assert.deepEqual(step(err(1)), [], "a blip");
  assert.deepEqual(step(ok), [], "back where it was");
  assert.deepEqual(step(err(1)), []);
  assert.deepEqual(step(err(2)), ["erreur : lecture de la PR sur GitHub impossible"]);
  assert.deepEqual(step(err(3)), []);
  assert.deepEqual(step(ok), ["ok : CI verte"], "after a written error, the return is news");
});

test("roundLines: every watched PR failing is one GitHub line, on the second round", () => {
  const err = (n) => ({ label: "erreur", why: "lecture de la PR sur GitHub impossible", head: "a", errorRounds: n });
  const ok = { label: "ok", why: "CI verte", head: "a", logged: [{ text: "ok : CI verte", head: "a", launch: false }] };
  const on = { on: true, journalOn: true };
  const before = { ...on, prs: { "o/r#1": ok, "o/r#2": ok } };
  const r1 = { on: true, prs: { "o/r#1": { ...err(1), logged: ok.logged }, "o/r#2": { ...err(1), logged: ok.logged } } };
  assert.deepEqual(roundLines(before, r1, new Map()), []);
  const r2 = { on: true, prs: { "o/r#1": { ...err(2), logged: ok.logged }, "o/r#2": { ...err(2), logged: ok.logged } } };
  assert.deepEqual(roundLines({ ...on, prs: r1.prs }, r2, new Map()).map((l) => [l.key, l.text]),
    [[null, "erreur : GitHub injoignable depuis 2 tours, 2 PR non lues"]]);
  const back = { on: true, prs: { "o/r#1": { ...ok }, "o/r#2": { ...ok } } };
  assert.deepEqual(roundLines({ ...on, prs: r2.prs }, back, new Map()), [], "the PRs are back where they were");
});

test("roundLines: an error that is not a GitHub read (squash refused) is written at once", () => {
  const out = roundLines({ on: true, journalOn: true, prs: { [K]: { label: "ok", why: "CI verte" } } },
    { on: true, prs: { [K]: { label: "erreur", why: "squash refusé", errorRounds: 0 } } }, new Map());
  assert.deepEqual(out.map((l) => l.text), ["erreur : squash refusé"]);
});

test("roundLines: one outage line per outage, then the PR still failing gets its own line once", () => {
  const err = (n) => ({ label: "erreur", why: "lecture de la PR sur GitHub impossible", head: "a", errorRounds: n });
  const ok = { label: "ok", why: "CI verte", head: "a" };
  const on = { on: true, journalOn: true };
  const round = (prev, next) => roundLines({ ...on, prs: prev }, { on: true, prs: next }, new Map()).map((l) => l.text);
  const r1 = { "o/r#1": err(1) }, r2 = { "o/r#1": err(2), "o/r#2": err(1) }, r3 = { "o/r#1": err(3), "o/r#2": err(2) };
  assert.deepEqual(round(r1, r2), ["erreur : GitHub injoignable depuis 2 tours, 2 PR non lues"]);
  assert.deepEqual(round(r2, r3), [], "the same outage, a PR reaching its second round later");
  const r4 = { "o/r#1": { ...err(4), logged: r3["o/r#1"].logged }, "o/r#2": { ...ok } };
  assert.deepEqual(round(r3, r4), ["erreur : lecture de la PR sur GitHub impossible", "ok : CI verte"]);
  const r5 = { "o/r#1": { ...err(5), logged: r4["o/r#1"].logged }, "o/r#2": { ...ok, logged: r4["o/r#2"].logged } };
  assert.deepEqual(round(r4, r5), [], "its line is written once");
});
