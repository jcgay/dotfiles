// node --test ~/.config/herdr-app/mods/pr/ci-model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { sinceDate, reposOf, isLong, longJobs, rowOf, fixBranch, fixOf, groups, fixPrompt, jenkinsDown, worktrees, remoteRepo, jkReached, listComplete, rowState } from "./ci-model.js";

test("sinceDate is 7 days back", () => assert.equal(sinceDate(Date.parse("2026-11-24T09:00:00Z")), "2026-11-17"));

test("reposOf unions PR and commit searches", () => {
  const prs = JSON.stringify([{ repository: { nameWithOwner: "softwarevidal/arthur" } }, { repository: { nameWithOwner: "softwarevidal/harnais" } }]);
  const commits = JSON.stringify([{ repository: { fullName: "softwarevidal/docker-lib-karadoc" } }, { repository: { fullName: "softwarevidal/arthur" } }]);
  assert.deepEqual(reposOf(prs, commits), ["softwarevidal/arthur", "softwarevidal/docker-lib-karadoc", "softwarevidal/harnais"]);
  // Two owners may have a repo of the same name: both stay.
  assert.deepEqual(reposOf(JSON.stringify([{ repository: { nameWithOwner: "b/x" } }]), JSON.stringify([{ repository: { fullName: "a/x" } }])), ["a/x", "b/x"]);
  assert.deepEqual(reposOf("", "not json"), []);
});

test("isLong", () => {
  for (const b of ["main", "master", "develop", "sprint-42", "sprint-conciliation", "release/v4"]) assert.ok(isLong(b), b);
  for (const b of ["PR-12", "feat/x", "masterpiece", "sprint", "release", "release/"]) assert.ok(!isLong(b), b);
});

test("longJobs keeps the raw job name", () => {
  const ls = JSON.stringify([{ name: "PR-1191" }, { name: "master" }, { name: "release%2Fv4" }, { name: "feat%2Fx" }]);
  assert.deepEqual(longJobs("softwarevidal/vira", ls, "team.software/github"), [
    { repo: "softwarevidal/vira", branch: "master", jobPath: "team.software/github/vira/master" },
    { repo: "softwarevidal/vira", branch: "release/v4", jobPath: "team.software/github/vira/release%2Fv4" },
  ]);
  assert.deepEqual(longJobs("softwarevidal/vira", "oops", "team.software/github"), []);
});

test("rowState and rowOf", () => {
  const now = Date.parse("2026-11-24T09:00:00Z");
  const run = (o) => JSON.stringify({ items: [{ number: 12, status: "completed", result: "SUCCESS", startTime: "2026-11-24T07:00:00Z", durationMs: 1000, url: "u", ...o }] });
  const job = { repo: "vira", branch: "master", jobPath: "p" };
  assert.deepEqual(rowOf(job, run({}), now), { repo: "vira", branch: "master", jobPath: "p", number: 12, state: "ok", result: "SUCCESS",
    startTime: Date.parse("2026-11-24T07:00:00Z"), durationMs: 1000, url: "u" });
  for (const r of ["FAILURE", "UNSTABLE", "ABORTED"]) assert.equal(rowOf(job, run({ result: r }), now).state, "ko");
  assert.equal(rowOf(job, run({ status: "running", result: null }), now).state, "running");
  assert.equal(rowOf(job, run({ startTime: "2026-11-10T00:00:00Z" }), now), null);
  assert.equal(rowOf(job, JSON.stringify({ items: [] }), now), null);
  assert.equal(rowOf(job, "", now), null);
});

test("fixBranch", () => assert.equal(fixBranch("release/v4", 12), "fix/ci-release-v4-12"));

test("fixOf", () => {
  const row = { branch: "master", number: 12 };
  assert.deepEqual(fixOf(row, [{ number: 5520, headRefName: "fix/ci-master-10", url: "u" }], []), { pr: { number: 5520, url: "u" }, branch: "fix/ci-master-10" });
  assert.deepEqual(fixOf(row, [], ["fix/ci-master-12"]), { branch: "fix/ci-master-12" });
  assert.equal(fixOf(row, [], ["fix/ci-master-10"]), null);
  assert.equal(fixOf(row, [{ number: 1, headRefName: "fix/ci-master-old-1", url: "u" }], []), null);
});

test("groups puts red repos first", () => {
  const r = (repo, branch, state) => ({ repo, branch, state });
  assert.deepEqual(groups([r("arthur", "master", "ok"), r("vira", "master", "ok"), r("vira", "develop", "ko"), r("harnais", "main", "running")]), [
    { repo: "vira", rows: [r("vira", "develop", "ko"), r("vira", "master", "ok")] },
    { repo: "arthur", rows: [r("arthur", "master", "ok")] },
    { repo: "harnais", rows: [r("harnais", "main", "running")] },
  ]);
});

test("fixPrompt names the log, rerun, fix branch and draft PR", () => {
  const p = fixPrompt({ repo: "vira", branch: "release/v4", jobPath: "team.software/github/vira/release%2Fv4", number: 12, result: "UNSTABLE" });
  for (const s of ["jk log team.software/github/vira/release%2Fv4 12", "jk run rerun team.software/github/vira/release%2Fv4 12",
    "fix/ci-release-v4-12", "--draft", "--base release/v4", "UNSTABLE"]) assert.ok(p.includes(s), s);
});

test("jenkinsDown only when every call failed", () => {
  assert.equal(jenkinsDown([]), false);
  assert.equal(jenkinsDown([{ ok: false }, { ok: false }]), true);
  assert.equal(jenkinsDown([{ ok: false }, { ok: true }]), false);
});

test("worktrees parses git worktree list --porcelain", () => {
  const out = "worktree /dev/arthur\nHEAD 1\nbranch refs/heads/master\n\nworktree /wt/arthur/fix-ci-master-12\nHEAD 2\nbranch refs/heads/fix/ci-master-12\n\nworktree /wt/x-watch\nHEAD 3\ndetached\n";
  assert.deepEqual(worktrees(out), [
    { folder: "/dev/arthur", branch: "master" },
    { folder: "/wt/arthur/fix-ci-master-12", branch: "fix/ci-master-12" },
    { folder: "/wt/x-watch", branch: null },
  ]);
  assert.deepEqual(worktrees(""), []);
});

test("remoteRepo", () => {
  assert.equal(remoteRepo("git@github.com:softwarevidal/arthur.git\n"), "softwarevidal/arthur");
  assert.equal(remoteRepo("https://github.com/softwarevidal/arthur"), "softwarevidal/arthur");
  assert.equal(remoteRepo("git@gitlab.com:x/y.git"), null);
});

test("jkReached: a 404 (no Jenkins folder for this repo) still reached Jenkins", () => {
  assert.equal(jkReached({ code: 0, stderr: "" }), true);
  assert.equal(jkReached({ code: 1, stderr: 'Error: GET /job/team.software/job/github/job/x/api/json: 404 Not Found: {"status":"404"}' }), true);
  assert.equal(jkReached({ code: 1, stderr: "dial tcp: lookup jenkins.vidal.net: no such host" }), false);
  assert.equal(jkReached({ code: 1, stderr: "Error: timeout" }), false);
});

test("rowState: only SUCCESS is ok, NOT_BUILT is idle", () => {
  assert.equal(rowState({ status: "completed", result: "SUCCESS" }), "ok");
  assert.equal(rowState({ status: "completed", result: "NOT_BUILT" }), "idle");
  assert.equal(rowState({ status: "completed", result: null }), "idle");
  assert.equal(rowState({ status: "completed", result: "UNSTABLE" }), "ko");
  assert.equal(rowState({ status: "running", result: null }), "running");
});

test("listComplete: cache the lists only when every search and jk job ls answered", () => {
  const ok = { code: 0, stderr: "" }, e404 = { code: 1, stderr: "404 Not Found" }, down = { code: 1, stderr: "timeout" };
  assert.equal(listComplete([ok, ok], [ok, e404]), true);
  assert.equal(listComplete([ok, { code: 1, stderr: "rate limit" }], [ok]), false);
  assert.equal(listComplete([ok, ok], [ok, down]), false);
  assert.equal(listComplete([ok, ok], []), true);
});

test("parseConfig: missing, unreadable or ownerless config is an error", async () => {
  const { parseConfig, CONFIG_ERROR } = await import("./ci-model.js");
  for (const t of [null, "{", "[]", '{"owners":[]}', '{"owners":[""]}']) assert.deepEqual(parseConfig(t), { error: CONFIG_ERROR });
  assert.equal(CONFIG_ERROR, "~/.config/herdr-app/config.json absent ou invalide : lance yadm alt"); // names the file: start-work has a config.json of its own
  assert.deepEqual(parseConfig('{"owners":["a"],"dockerQa":true}'), { config: { owners: ["a"], dockerQa: true } });
});

test("repoLabel: the name alone with one owner", async () => {
  const { repoLabel } = await import("./ci-model.js");
  assert.equal(repoLabel("o/r", ["o"]), "r");
  assert.equal(repoLabel("o/r", ["o", "p"]), "o/r");
});
