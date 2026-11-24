// node --test ~/.config/herdr-app/mods/pr/ci-model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { sinceDate, reposOf, isLong, longJobs, rowOf, fixBranch, fixOf, groups, fixPrompt, jenkinsDown } from "./ci-model.js";

test("sinceDate is 7 days back", () => assert.equal(sinceDate(Date.parse("2026-11-24T09:00:00Z")), "2026-11-17"));

test("reposOf unions PR and commit searches", () => {
  const prs = JSON.stringify([{ repository: { nameWithOwner: "softwarevidal/arthur" } }, { repository: { nameWithOwner: "softwarevidal/harnais" } }]);
  const commits = JSON.stringify([{ repository: { fullName: "softwarevidal/docker-lib-karadoc" } }, { repository: { fullName: "softwarevidal/arthur" } }]);
  assert.deepEqual(reposOf(prs, commits), ["arthur", "docker-lib-karadoc", "harnais"]);
  assert.deepEqual(reposOf("", "not json"), []);
});

test("isLong", () => {
  for (const b of ["main", "master", "develop", "sprint-42", "sprint-conciliation", "release/v4"]) assert.ok(isLong(b), b);
  for (const b of ["PR-12", "feat/x", "masterpiece", "sprint", "release", "release/"]) assert.ok(!isLong(b), b);
});

test("longJobs keeps the raw job name", () => {
  const ls = JSON.stringify([{ name: "PR-1191" }, { name: "master" }, { name: "release%2Fv4" }, { name: "feat%2Fx" }]);
  assert.deepEqual(longJobs("vira", ls), [
    { repo: "vira", branch: "master", jobPath: "team.software/github/vira/master" },
    { repo: "vira", branch: "release/v4", jobPath: "team.software/github/vira/release%2Fv4" },
  ]);
  assert.deepEqual(longJobs("vira", "oops"), []);
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
  assert.deepEqual(fixOf(row, [{ number: 5520, headRefName: "fix/ci-master-10", url: "u" }], []), { pr: { number: 5520, url: "u" } });
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
