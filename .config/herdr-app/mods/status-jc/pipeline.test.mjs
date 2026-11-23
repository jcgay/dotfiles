// node --test ~/.config/herdr-app/mods/status-jc/pipeline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, bandOf, measure, addSamples, median, clockOf, workOf } from "./pipeline.js";
import { emptyEntry, karadocHolder } from "./watch.js";

const ALL = { hasCi: true, hasQa: true, hasDemo: true, hasSonar: true };
const green = (over = {}) => ({
  head: "h1", conflict: false, draft: false, approved: false, fixups: 0, pending: false, failing: false, reported: true,
  jenkins: { state: "ok" }, sonar: { state: "ok" }, markers: new Set(), ...over,
});
const band = (s, e, ctx = ALL) => Object.fromEntries(bandOf(s, { ...emptyEntry(), head: s.head, ...e }, ctx).map((v, i) => [STEPS[i], v]));

test("a green PR with qa running", () => {
  const b = band(green({ markers: new Set(["pr-review"]) }), { launched: { step: "qa", head: "h1", tab: "⟳ #1 qa" } });
  assert.deepEqual(b, { git: "ok", jenk: "ok", sonar: "ok", rev: "ok", qa: "run", demo: "todo", risk: "todo", appr: "todo", merge: "todo" });
});

test("pr-review runs until its tab closes, though its marker comes first", () => {
  const b = band(green({ markers: new Set(["pr-review"]) }), { launched: { step: "pr-review", head: "h1", tab: "⟳ #1 pr-review" } });
  assert.equal(b.rev, "run");
});

test("a conflict the watch gave up on is mine, CI waits behind it", () => {
  const b = band(green({ conflict: true }), { attempts: { jenkins: 0, sonar: 0, rebase: 2 } });
  assert.equal(b.git, "me");
  assert.equal(b.jenk, "todo");
});

test("a failing Jenkins is red until its budget is spent", () => {
  assert.equal(band(green({ jenkins: { state: "ko" } }), {}).jenk, "ko");
  assert.equal(band(green({ jenkins: { state: "ko" } }), { attempts: { jenkins: 2, sonar: 0 } }).jenk, "me");
  assert.equal(band(green({ jenkins: { state: "ko" } }), { launched: { step: "jenkins", head: "h1" } }).jenk, "run");
});

test("a failing check the watch does not fix is mine, except on a draft", () => {
  assert.equal(band(green({ failing: true }), {}).jenk, "me");
  assert.equal(bandOf(green({ failing: true, draft: true }), emptyEntry(), ALL)[1], "ok");
});

test("measure: a CI without Jenkins is timed from the checks GitHub reports", () => {
  const start = measure(emptyEntry(), emptyEntry(), green({ jenkins: null, sonar: null, pending: true }), 1000);
  assert.deepEqual(start.ci.jenkins, { head: "h1", since: 1000 });
  const before = { ...emptyEntry(), ci: start.ci };
  assert.deepEqual(measure(before, before, green({ jenkins: null, sonar: null }), 7000).samples, [["ci:jenkins", 6000]]);
});

test("a failing check is not mine while Sonar has yet to report on the head", () => {
  assert.equal(band(green({ failing: true, sonar: null }), { seen: { jenkins: true, sonar: true } }).jenk, "ok");
});

test("a PR labelled à toi for another reason (unpushed work) gets its next case violet", () => {
  const b = band(green(), { label: "à toi" });
  assert.equal(b.rev, "me");
  assert.equal(band(green({ draft: true, jenkins: { state: "running" } }), { label: "à toi" }).jenk, "me");
});

test("approved fixups still to squash keep appr open", () => {
  const done = new Set(["pr-review", "qa", "pr-demo", "pr-risk"]);
  assert.equal(band(green({ markers: done, approved: true, fixups: 2 }), {}).appr, "todo");
  assert.equal(band(green({ markers: done, approved: true, fixups: 2 }), { attempts: { jenkins: 0, sonar: 0, squash: 2 } }).appr, "me");
});

test("a draft has three cases", () => {
  assert.equal(bandOf(green({ draft: true }), emptyEntry(), ALL).length, 3);
});

test("steps a repo never runs are dotted", () => {
  const b = band(green({ sonar: null, reported: false, jenkins: null }), {}, { hasCi: false, hasQa: false, hasDemo: false, hasSonar: false });
  assert.deepEqual([b.jenk, b.sonar, b.qa, b.demo], ["skip", "skip", "skip", "skip"]);
});

test("a review closed without comment is dotted", () => {
  assert.equal(band(green(), { silent: { h1: ["pr-review"] } }).rev, "skip");
});

test("after every review, approval waits on a human, then is done", () => {
  const done = new Set(["pr-review", "qa", "pr-demo", "pr-risk"]);
  assert.equal(band(green({ markers: done }), {}).appr, "wait");
  assert.equal(band(green({ markers: done, approved: true }), {}).appr, "ok");
  assert.equal(band(green({ markers: done, approved: true, fixups: 2 }), { launched: { step: "squash", head: "h1" } }).appr, "run");
});

test("a PR GitHub could not read keeps its last band", () => {
  assert.deepEqual(bandOf({ error: "boom" }, { ...emptyEntry(), band: ["ok"] }, ALL), ["ok"]);
});

test("measure: a review agent that left its marker gives one sample", () => {
  const before = { ...emptyEntry(), launched: { step: "qa", head: "h1", tab: "⟳ #1 qa", at: 1000 } };
  const after = { ...before, launched: null };
  assert.deepEqual(measure(before, after, green({ markers: new Set(["qa"]) }), 61000).samples, [["agent:qa", 60000]]);
  assert.deepEqual(measure(before, after, green(), 61000).samples, []);
});

test("measure: a fix agent that stopped gives one sample", () => {
  const before = { ...emptyEntry(), launched: { step: "jenkins", head: "h1", tab: "⟳ #1 jenkins", at: 0 } };
  assert.deepEqual(measure(before, { ...before, launched: null }, green(), 5000).samples, [["agent:jenkins", 5000]]);
});

test("measure: Jenkins timed from the first round seeing it run to the first seeing it finish, same head only", () => {
  const start = measure(emptyEntry(), emptyEntry(), green({ jenkins: { state: "running" }, sonar: null }), 1000);
  assert.deepEqual(start.ci.jenkins, { head: "h1", since: 1000 });
  const before = { ...emptyEntry(), ci: start.ci };
  assert.deepEqual(measure(before, before, green({ sonar: null }), 9000).samples, [["ci:jenkins", 8000]]);
  const moved = measure(before, before, green({ head: "h2", sonar: null }), 9000);
  assert.deepEqual(moved.samples, []);
  assert.equal(moved.ci.jenkins, null);
});

test("measure: Sonar's own timestamps win over the rounds", () => {
  const before = { ...emptyEntry(), ci: { jenkins: null, sonar: { head: "h1", since: 0 } } };
  assert.deepEqual(measure(before, before, green({ jenkins: null, sonar: { state: "ok", took: 42000 } }), 120000).samples, [["ci:sonar", 42000]]);
});

test("measure: a check-run that ran between two rounds is timed once from its timestamps", () => {
  const first = measure(emptyEntry(), emptyEntry(), green({ jenkins: null, sonar: { state: "ok", took: 90000 } }), 1000);
  assert.deepEqual(first.samples, [["ci:sonar", 90000]]);
  const again = measure({ ...emptyEntry(), ci: first.ci }, emptyEntry(), green({ jenkins: null, sonar: { state: "ok", took: 90000 } }), 2000);
  assert.deepEqual(again.samples, [], "the same head is not sampled twice");
  const ci = measure(emptyEntry(), emptyEntry(), green({ jenkins: null, sonar: null, ciTook: 300000 }), 1000);
  assert.deepEqual(ci.samples, [["ci:jenkins", 300000]], "Actions checks' own timestamps");
});

test("addSamples keeps the last ten per step", () => {
  let d = {};
  for (let i = 1; i <= 12; i++) d = addSamples(d, [["agent:qa", i]]);
  assert.deepEqual(d["agent:qa"], [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("median needs three samples", () => {
  assert.equal(median([1, 2]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

const MIN = 60000;
const many = (ms) => [ms, ms, ms];

test("clockOf: the running step and no estimate without history", () => {
  const e = { ...emptyEntry(), band: ["ok", "ok", "ok", "ok", "run", "todo", "todo", "todo", "todo"], launched: { step: "qa", at: 0 } };
  assert.deepEqual(clockOf(e, {}, 12 * MIN), { step: "qa", since: 0, readyAt: null });
  const sampled = { ...e, launched: null, ci: { jenkins: { head: "h1", sampled: true }, sonar: null } };
  assert.equal(clockOf(sampled, {}, 0).step, null, "a sampled check is not running");
});

test("clockOf: ready at is what is left of the step plus the next ones", () => {
  const e = { ...emptyEntry(), band: ["ok", "ok", "ok", "ok", "run", "todo", "todo", "todo", "todo"], launched: { step: "qa", at: 0 } };
  const d = { "agent:qa": many(20 * MIN), "agent:pr-demo": many(10 * MIN), "agent:pr-risk": many(5 * MIN) };
  assert.equal(clockOf(e, d, 12 * MIN).readyAt, 12 * MIN + 8 * MIN + 15 * MIN);
});

test("clockOf: a review still to do counts one more CI pass", () => {
  const e = { ...emptyEntry(), band: ["ok", "ok", "ok", "todo", "skip", "skip", "todo", "todo", "todo"] };
  const d = { "agent:pr-review": many(10 * MIN), "ci:jenkins": many(14 * MIN), "ci:sonar": many(2 * MIN), "agent:pr-risk": many(5 * MIN) };
  assert.deepEqual(clockOf(e, d, 0), { step: null, since: null, readyAt: 31 * MIN });
});

test("clockOf: a PR waiting on me says so", () => {
  const e = { ...emptyEntry(), label: "à toi", band: ["me", "todo", "todo", "todo", "todo", "todo", "todo", "todo", "todo"] };
  assert.deepEqual(clockOf(e, {}, 0), { yours: true });
  const reviewing = { ...emptyEntry(), label: "agent en cours", band: ["ok", "ok", "me", "ok", "run", "todo", "todo", "todo", "todo"], launched: { step: "qa", at: 0 } };
  assert.equal(clockOf(reviewing, {}, 0).step, "qa", "Sonar issues left to me do not stop the reviews");
});

test("clockOf: CI running is timed from its tracker", () => {
  const e = { ...emptyEntry(), band: ["ok", "run", "todo", "todo", "skip", "skip", "todo", "todo", "todo"], ci: { jenkins: { head: "h1", since: 0 }, sonar: null } };
  assert.equal(clockOf(e, {}, 3 * MIN).step, "CI");
});

const PORCELAIN = `worktree /c/arthur
HEAD a
branch refs/heads/master

worktree /w/arthur/feat/x
HEAD b
branch refs/heads/feat/x

worktree /w/arthur/feat/y-watch
HEAD c
detached
`;

test("workOf: a draft opens its branch checkout, a ready PR its -watch", () => {
  assert.deepEqual(workOf(PORCELAIN, { draft: true, branch: "feat/x", watch: "/w/arthur/feat/x-watch" }), { folder: "/w/arthur/feat/x", exists: true });
  assert.deepEqual(workOf(PORCELAIN, { draft: true, branch: "feat/z", watch: "/w/arthur/feat/z-watch" }), { folder: null, exists: false });
  assert.deepEqual(workOf(PORCELAIN, { draft: false, branch: "feat/y", watch: "/w/arthur/feat/y-watch" }), { folder: "/w/arthur/feat/y-watch", exists: true });
  assert.deepEqual(workOf(PORCELAIN, { draft: false, branch: "feat/x", watch: "/w/arthur/feat/x-watch" }), { folder: "/w/arthur/feat/x-watch", exists: false });
});

test("karadocHolder names the tab holding karadoc", () => {
  assert.equal(karadocHolder(["⟳ #12 pr-review", "⟳ #5471 qa"], new Set([5471]), new Set([5471])), "⟳ #5471 qa");
  assert.equal(karadocHolder(["⟳ #12 pr-review"], new Set([12]), new Set([12])), null);
});

test("a 0-human pr-risk verdict on the head stands for the approval", () => {
  const done = new Set(["pr-review", "qa", "pr-demo", "pr-risk"]);
  const risk = (humans) => ({ humans, sha: "x", onHead: true });
  assert.equal(band(green({ markers: done, risk: risk(0) }), {}).appr, "ok");
  assert.equal(band(green({ markers: done, risk: risk(0), fixups: 2 }), {}).appr, "todo");
  assert.equal(band(green({ markers: done, risk: risk(1) }), {}).appr, "wait");
  assert.equal(band(green({ markers: done, risk: { ...risk(0), onHead: null } }), {}).appr, "wait");
});
