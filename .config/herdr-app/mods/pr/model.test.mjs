// node --test ~/.config/herdr-app/mods/pr/model.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { jenkinsBuild, checks, otherChecks, summary, minutes, parseContainers, deploymentsFor, deployKey, watchBranch, remember, clockText, workLook, rowActions, bandStates, nextRound, isDraft, hiddenDraft, sessionOf } from "./model.js";

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

const MIN = 60000;

test("clockText says the running step, the time to ready, or that it waits on me", () => {
  assert.equal(clockText(null, 0), null);
  assert.equal(clockText({ yours: true }, 0), "dépend de toi");
  assert.equal(clockText({ step: "qa", since: 0, readyAt: 47 * MIN }, 12 * MIN), "qa depuis 12 min · prête à approuver dans ~35 min");
  assert.equal(clockText({ step: "CI", since: 0, readyAt: null }, 3 * MIN), "CI depuis 3 min");
  assert.equal(clockText({ step: null, since: null, readyAt: 1 }, 2), "prête à approuver bientôt");
  assert.equal(clockText({ step: null, since: null, readyAt: null }, 0), null);
});

test("workLook: missing, there, or shown by a space (sub-folders too, not a sibling prefix)", () => {
  assert.deepEqual(workLook(null, []), { tip: "Travailler dessus", missing: false, shown: false });
  assert.deepEqual(workLook({ folder: "/w/x-watch", exists: false }, []), { tip: "Créer le worktree et travailler dessus", missing: true, shown: false });
  assert.deepEqual(workLook({ folder: "/w/x-watch", exists: true }, ["/w/x-watch-old"]), { tip: "Ouvrir le worktree", missing: false, shown: false });
  assert.deepEqual(workLook({ folder: "/w/x-watch", exists: true }, ["/w/x-watch/src"]), { tip: "Aller au space", missing: false, shown: true });
  assert.equal(workLook({ folder: null, exists: false }, ["/w"]).shown, false);
});

test("rowActions: squash with fixups unless one runs, arm a ready PR, disarm an armed one", () => {
  const ready = { draft: false, head: "abc", fixups: 2 };
  assert.deepEqual(rowActions(ready, null, null), { squash: true, arm: null }, "status-jc cancels a merge armed over fixup! commits");
  assert.equal(rowActions({ ...ready, fixups: 0 }, null, null).arm, "arm");
  assert.equal(rowActions(ready, { head: "abc", refused: true, error: "protected" }, null).arm, "refused");
  assert.deepEqual(rowActions(ready, { head: "abc" }, { state: "running" }), { squash: false, arm: "disarm" });
  assert.equal(rowActions(ready, null, { state: "error" }).squash, true, "a failed squash can be asked again");
  assert.deepEqual(rowActions({ draft: true, head: "abc", fixups: 0 }, null, null), { squash: false, arm: null });
  assert.equal(rowActions({ head: "abc" }, null, null).arm, null, "an entry from before the band has no draft flag");
});

test("bandStates: nine slots, merge orange once armed, a draft's empty slots stay empty", () => {
  const band = ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "wait", "todo"];
  assert.equal(bandStates(band, false)[8], "todo");
  assert.equal(bandStates(band, true)[8], "run");
  assert.equal(bandStates(band, { refused: true })[8], "ko", "a refused merge is not running");
  assert.equal(bandStates(band, { head: "abc" })[8], "run");
  assert.deepEqual(bandStates(["ok", "run", "skip"], true), ["ok", "run", "skip", null, null, null, null, null, null]);
});

test("nextRound: running, asked, due in, or never ran", () => {
  assert.equal(nextRound(null, false, 0), "pas encore de tour");
  assert.equal(nextRound({ running: true, at: 0 }, false, 0), "tour en cours");
  assert.equal(nextRound({ at: 0 }, true, 0), "tour en cours");
  assert.equal(nextRound({ at: 0 }, false, 0), "pas encore de tour", "a fresh registry's at is 0");
  assert.equal(nextRound({ at: 1000, every: 120000 }, false, 31000), "tour dans 2 min");
  assert.equal(nextRound({ at: 1000, every: 120000 }, false, 116000), "tour dans 1 min");
  assert.equal(nextRound({ at: 1000 }, false, 1000), "tour dans 5 min", "a registry from before every");
  assert.equal(nextRound({ at: 1000, every: 120000, next: 121000 }, false, 101000), "tour dans 1 min", "the timer's own schedule wins");
});

test("isDraft: a draft, paused or not, and one from a registry before the band", () => {
  assert.equal(isDraft({ draft: true, label: "en pause" }), true);
  assert.equal(isDraft({ label: "brouillon" }), true);
  assert.equal(isDraft({ draft: false, label: "ok" }), false);
});

test("hiddenDraft: hidden drafts keep the ones that need me", () => {
  assert.equal(hiddenDraft({ draft: true, label: "brouillon" }, true), true);
  assert.equal(hiddenDraft({ draft: true, label: "à toi" }, true), false);
  assert.equal(hiddenDraft({ draft: true, label: "erreur" }, true), false);
  assert.equal(hiddenDraft({ draft: true, label: "brouillon" }, false), false);
  assert.equal(hiddenDraft({ draft: false, label: "ok" }, true), false);
});

test("sessionOf: the last session launched for a band cell", () => {
  const sessions = { rebase: { id: "a", folder: "/w", at: 1 }, squash: { id: "b", folder: "/w", at: 2 }, "pr-demo": { id: "c", folder: "/w", at: 3 } };
  assert.deepEqual(sessionOf(sessions, "git"), { step: "squash", id: "b", folder: "/w", at: 2 });
  assert.deepEqual(sessionOf(sessions, "demo"), { step: "pr-demo", id: "c", folder: "/w", at: 3 });
  assert.equal(sessionOf(sessions, "qa"), null, "never launched");
  assert.equal(sessionOf(sessions, "appr"), null, "not an agent step");
  assert.equal(sessionOf(undefined, "git"), null, "entry from before sessions were kept");
});
