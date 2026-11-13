// node --test ~/.config/herdr-app/mods/pr/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { jenkinsBuild, checks, minutes } from "./model.js";

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
