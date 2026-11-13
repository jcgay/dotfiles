// node --test ~/.config/herdr-app/mods/pr/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { jenkinsBuild, checks, minutes, parseContainers, deploymentsFor, deployKey } from "./model.js";

test("jenkins build url", () => {
  assert.deepEqual(jenkinsBuild("https://jenkins.vidal.net/job/team.software/job/github/job/arthur/job/PR-5459/1/display/redirect"),
    { jobPath: "team.software/github/arthur/PR-5459", number: 1 });
  assert.deepEqual(jenkinsBuild("https://j/job/a%2Fb/7/"), { jobPath: "a/b", number: 7 });
  assert.equal(jenkinsBuild("https://github.com/x/y/actions/runs/1"), null);
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
