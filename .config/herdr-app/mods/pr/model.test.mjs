// node --test ~/.config/herdr-app/mods/pr/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { jenkinsBuild, checks, otherChecks, summary, minutes, parseContainers, deploymentsFor, deployKey, watchBranch, remember } from "./model.js";

test("jenkins build url", () => {
  assert.deepEqual(jenkinsBuild("https://jenkins.vidal.net/job/team.software/job/github/job/arthur/job/PR-5459/1/display/redirect"),
    { jobPath: "team.software/github/arthur/PR-5459", number: 1 });
  assert.deepEqual(jenkinsBuild("https://j/job/a%2Fb/7/"), { jobPath: "a/b", number: 7 });
  assert.equal(jenkinsBuild("https://github.com/x/y/actions/runs/1"), null);
});

test("checks other than the shown Jenkins build", () => {
  const list = [
    { name: "pr-merge", state: "ok", url: "https://j/job/a/job/PR-1/12/display/redirect" },
    { name: "pr-head", state: "ok", url: "https://j/job/a/job/PR-1/12/" },
    { name: "other job", state: "ko", url: "https://j/job/b/job/PR-1/3/" },
    { name: "sonar", state: "ok", url: "https://sonarcloud.io/x" },
    { name: "no url", state: "running", url: null },
  ];
  assert.deepEqual(otherChecks(list, { jobPath: "a/PR-1", number: 12 }).map((c) => c.name), ["other job", "sonar", "no url"]);
  assert.equal(otherChecks(list, null).length, 5);
});

test("checks summary", () => {
  assert.equal(summary([]), null);
  assert.deepEqual(summary([{ state: "ok" }, { state: "ok" }, { state: "ok" }]), { state: "ok", text: "3 ✓" });
  assert.deepEqual(summary([{ state: "ok" }, { state: "ko" }, { state: "running" }, { state: "ok" }]),
    { state: "ko", text: "1 en échec · 1 en cours · 2 ✓" });
  assert.deepEqual(summary([{ state: "running" }, { state: "ok" }]), { state: "running", text: "1 en cours · 1 ✓" });
});

test("checks of both kinds", () => {
  assert.deepEqual(checks([
    { __typename: "StatusContext", context: "jenkins", state: "ERROR", targetUrl: "u" },
    { __typename: "CheckRun", name: "sonar", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "v" },
    { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: "" },
    { __typename: "StatusContext", context: "pending", state: "PENDING" },
  ]).map((c) => c.state), ["ko", "ok", "running", "running"]);
});

test("minutes", () => {
  assert.equal(minutes(1435659), "24 min");
  assert.equal(minutes(3 * 3600000 + 5 * 60000), "3 h 05");
});


test("deployments by repo and branch, or by host name", () => {
  const out = [
    `/karadoc-sprint|${JSON.stringify(["SECRET=x", "VIRTUAL_HOST=sprint-la-search.dockersw.vidal.net", "VIDAL_REPOSITORY=arthur", "VIDAL_GIT_REMOTE_BRANCH=sprint-la-search"])}`,
    `/karadoc-master|${JSON.stringify(["VIRTUAL_HOST=master.dockersw.vidal.net", "VIDAL_REPOSITORY=arthur", "VIDAL_GIT_REMOTE_BRANCH=master"])}`,
    `/mcp|${JSON.stringify(["VIRTUAL_HOST=mcp.dockersw2.vidal.fr", "VIDAL_REPOSITORY=vidal-mcp", "VIDAL_GIT_REMOTE_BRANCH=feat/x"])}`,
    `/lycos-pr-424|${JSON.stringify(["VIRTUAL_HOST=lycos-pr-424.dockerbo.vidal.net"])}`,
    `/lycos-pr-4245|${JSON.stringify(["VIRTUAL_HOST=lycos-pr-4245.dockerbo.vidal.net"])}`,
    `/no-host|${JSON.stringify(["A=b"])}`,
    `/broken|not json`,
  ].join("\n");
  const cs = parseContainers(out);
  assert.equal(cs.length, 5);
  assert.equal(JSON.stringify(cs).includes("SECRET"), false);
  assert.deepEqual(deploymentsFor(cs, { repo: "arthur", branch: "sprint-la-search", pr: 5 }), ["http://sprint-la-search.dockersw.vidal.net"]);
  assert.deepEqual(deploymentsFor(cs, { repo: "vidal-mcp", branch: "feat/x" }), ["https://mcp.dockersw2.vidal.fr"]);
  assert.deepEqual(deploymentsFor(cs, { repo: "lycos", branch: "fix", pr: 424 }), ["http://lycos-pr-424.dockerbo.vidal.net"]);
  assert.deepEqual(deploymentsFor(cs, { repo: "arthur", branch: "nope", pr: 424 }), []);
});

test("DockerBo deploy key from the PR title", () => {
  assert.equal(deployKey("MM-1505: (fix) Hide orphans [DEPLOY_PR][mm1505][DEPLOY_DB]"), "mm1505");
  assert.equal(deployKey("display tree [DEPLOY_PR][My_Tree.v-2]"), "mytreev2");
  assert.equal(deployKey("no deploy"), null);
  const cs = parseContainers([
    `/babel-mm1505|${JSON.stringify(["VIRTUAL_HOST=babel-mm1505.dockerbo.vidal.net"])}`,
    `/kisscool-mm1505|${JSON.stringify(["VIRTUAL_HOST=kisscool-mm1505.dockerbo.vidal.net"])}`,
  ].join("\n"));
  assert.deepEqual(deploymentsFor(cs, { repo: "babel", branch: "MM-1505-x", pr: 2415, title: "MM-1505: fix [DEPLOY_PR][mm1505]" }),
    ["http://babel-mm1505.dockerbo.vidal.net"]);
});

test("branch of a PR watch worktree", () => {
  assert.equal(watchBranch("/Users/jc/dev/agents-worktree/arthur/MERLIN-2321-watch"), "MERLIN-2321");
  assert.equal(watchBranch("/Users/jc/dev/agents-worktree/ordostruct/feat/local-posology-families-watch"), "feat/local-posology-families");
  assert.equal(watchBranch("/Volumes/sourcecode/arthur-5355"), null);
  assert.equal(watchBranch(null), null);
});

test("remember keeps the newest keys only", () => {
  const map = new Map();
  remember(map, "a", 1, 2); remember(map, "b", 2, 2);
  remember(map, "a", 3, 2); // rewritten: newest again
  remember(map, "c", 4, 2);
  assert.deepEqual([...map], [["a", 3], ["c", 4]]);
});
