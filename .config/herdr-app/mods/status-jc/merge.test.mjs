// node --test ~/.config/herdr-app/mods/status-jc/merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARMED, mergeStep, applyResults } from "./merge.js";

const armed = { head: "abc", at: 1 };
const ok = [{ context: "continuous-integration/jenkins/pr-merge", state: "SUCCESS" }];
const view = (patch) => ({ state: "OPEN", headRefOid: "abc", statusCheckRollup: ok, commits: [], ...patch });

test("the registry key is pr-merge", () => assert.equal(ARMED, "pr-merge"));

test("a merged or closed PR is dropped without toast", () => {
  for (const state of ["MERGED", "CLOSED"]) {
    assert.deepEqual(mergeStep("o/r#7", view({ state }), armed), { action: "drop", why: null, toast: null });
  }
});

test("a new head drops the armed merge", () => {
  assert.deepEqual(mergeStep("o/r#7", view({ headRefOid: "def" }), armed),
    { action: "drop", why: null, toast: "PR #7 : nouveau commit, merge annulé" });
});

test("a fixup!, amend! or squash! commit drops the armed merge", () => {
  for (const prefix of ["fixup! ", "amend! ", "squash! "]) {
    assert.deepEqual(mergeStep("o/r#7", view({ commits: [{ messageHeadline: "Fix x" }, { messageHeadline: `${prefix}Fix x` }] }), armed),
      { action: "drop", why: null, toast: "PR #7 : commit fixup!/amend!/squash!, merge annulé" });
  }
  assert.equal(mergeStep("o/r#7", view({ commits: [{ messageHeadline: "Fix fixup! handling" }] }), armed).action, "merge");
});

test("a fixup commit drops even while the CI runs", () => {
  const r = mergeStep("o/r#7", view({ statusCheckRollup: [{ context: "ci", state: "PENDING" }], commits: [{ messageHeadline: "fixup! a" }] }), armed);
  assert.equal(r.action, "drop");
});

test("no check, a running check or a failed check waits", () => {
  assert.deepEqual(mergeStep("o/r#7", view({ statusCheckRollup: [] }), armed), { action: "wait", why: "aucun check sur ce commit", toast: null });
  assert.deepEqual(mergeStep("o/r#7", view({ statusCheckRollup: [...ok, { context: "ci", state: "PENDING" }] }), armed),
    { action: "wait", why: "CI en cours", toast: null });
  assert.deepEqual(mergeStep("o/r#7", view({ statusCheckRollup: [...ok, { name: "Sonar", conclusion: "FAILURE" }] }), armed),
    { action: "wait", why: "un check en échec", toast: null });
});

test("a repo with a Jenkinsfile waits for Jenkins to report on the head", () => {
  const renovate = [{ context: "renovate/stability-days", state: "SUCCESS" }];
  assert.deepEqual(mergeStep("o/r#7", view({ statusCheckRollup: renovate }), armed, { jenkinsfile: true }),
    { action: "wait", why: "Jenkins n'a pas encore rapporté sur ce commit", toast: null });
  assert.equal(mergeStep("o/r#7", view({ statusCheckRollup: [...renovate, ...ok] }), armed, { jenkinsfile: true }).action, "merge");
  assert.equal(mergeStep("o/r#7", view({ statusCheckRollup: renovate }), armed, { jenkinsfile: false }).action, "merge");
});

test("all green merges", () => {
  assert.deepEqual(mergeStep("o/r#7", view({ statusCheckRollup: [...ok, { name: "Sonar", status: "COMPLETED", conclusion: "SUCCESS" }] }), armed),
    { action: "merge", why: null, toast: null });
});

test("applyResults drops or updates only the same arming", () => {
  const cur = { "o/r#7": { head: "abc", at: 1, why: null, error: null } };
  assert.deepEqual(applyResults(cur, [{ key: "o/r#7", at: 1, drop: true }]), {});
  // re-armed during the round
  const rearmed = { "o/r#7": { head: "def", at: 2, why: null, error: null } };
  assert.deepEqual(applyResults(rearmed, [{ key: "o/r#7", at: 1, drop: true }]), rearmed);
  // disarmed during the round
  assert.deepEqual(applyResults({}, [{ key: "o/r#7", at: 1, drop: false, why: "CI en cours", error: null }]), {});
  assert.deepEqual(applyResults(cur, [{ key: "o/r#7", at: 1, drop: false, why: "CI en cours", error: null }]),
    { "o/r#7": { head: "abc", at: 1, why: "CI en cours", error: null } });
  assert.deepEqual(cur["o/r#7"].why, null, "current is not mutated");
});

test("applyResults keeps a refused merge with its error", () => {
  const cur = { "o/r#7": { head: "abc", at: 1, why: null, error: null } };
  assert.deepEqual(applyResults(cur, [{ key: "o/r#7", at: 1, drop: false, refused: true, error: "not mergeable" }]),
    { "o/r#7": { head: "abc", at: 1, why: null, error: "not mergeable", refused: true } });
});
