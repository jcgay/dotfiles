// node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSince, sonarFindings, markers, signalsOf, checks, jenkinsBuild, decide, emptyEntry, tabName, LABELS, promptFor, repoOfRemote, undoLaunch, holdingTabs, checkoutBases } from "./watch.js";

// Real summaries: arthur#5458 (passed) and arthur#5449 (failed gate).
const PASSED = `Issues  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/passed.svg '') [0 New issues](https://sonarcloud.io/project/issues?id=vidal_arthur&pullRequest=5458&issueStatuses=OPEN,CONFIRMED&sinceLeakPeriod=true)  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/accepted.svg '') [0 Accepted issues](https://sonarcloud.io/project/issues?id=vidal_arthur&pullRequest=5458&issueStatuses=ACCEPTED)

Measures  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/passed.svg '') [0 Security Hotspots](https://sonarcloud.io/project/security_hotspots?id=vidal_arthur&pullRequest=5458&issueStatuses=OPEN,CONFIRMED&sinceLeakPeriod=true)  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/passed.svg '') [100.0% Coverage on New Code](https://sonarcloud.io/component_measures?id=vidal_arthur&pullRequest=5458&metric=new_coverage&view=list)  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/passed.svg '') [0.0% Duplication on New Code](https://sonarcloud.io/component_measures?id=vidal_arthur&pullRequest=5458&metric=new_duplicated_lines_density&view=list)  
  
[See analysis details on SonarQube Cloud](https://sonarcloud.io/dashboard?id=vidal_arthur&pullRequest=5458)
`;
const FAILED = `Failed conditions  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/failed.svg '') [75.0% Coverage on New Code](https://sonarcloud.io/component_measures?id=vidal_arthur&pullRequest=5449&metric=new_coverage&view=list) (required ≥ 80%)  
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/failed.svg '') [C Maintainability Rating on New Code](https://sonarcloud.io/project/issues?id=vidal_arthur&pullRequest=5449&issueStatuses=OPEN,CONFIRMED&sinceLeakPeriod=true) (required ≥ A)  
  
[See analysis details on SonarQube Cloud](https://sonarcloud.io/dashboard?id=vidal_arthur&pullRequest=5449)

##   
![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/light_bulb.svg '') Catch issues before they fail your Quality Gate with our IDE extension ![](https://sonarsource.github.io/sonarcloud-github-static-resources/v2/common/sonarlint.svg '') [SonarQube for IDE](https://www.sonarsource.com/products/sonarlint/features/connected-mode/?referrer=pull-request)
`;

test("searchSince is seven days before now", () => {
  assert.equal(searchSince(new Date("2026-11-14T10:00:00Z")), "2026-11-07");
});

test("sonarFindings reads counts and the conclusion", () => {
  assert.deepEqual(sonarFindings({ conclusion: "success", output: { summary: PASSED } }), { failed: false, issues: 0, hotspots: 0 });
  const withFindings = PASSED.replace("[0 New issues]", "[3 New issues]").replace("[0 Security Hotspots]", "[1 Security Hotspots]");
  assert.deepEqual(sonarFindings({ conclusion: "success", output: { summary: withFindings } }), { failed: false, issues: 3, hotspots: 1 });
  assert.equal(sonarFindings({ conclusion: "failure", output: { summary: FAILED } }).failed, true);
  assert.deepEqual(sonarFindings({ conclusion: "success", output: { summary: "?" } }), { failed: false, issues: 0, hotspots: 0 });
  assert.equal(sonarFindings(null), null);
});

test("markers keeps only my comments", () => {
  const c = (login, body) => ({ author: { login }, body });
  const got = markers([c("jcgay", "<!-- pr-risk -->\nx"), c("jcgay", "<!-- testing-api-pull-requests -->\ny"), c("someone", "<!-- pr-demo -->")], "jcgay");
  assert.deepEqual(got, new Set(["pr-risk", "qa"]));
});

test("signalsOf combines Jenkins, Sonar and markers", () => {
  const view = {
    repo: "softwarevidal/arthur", number: 5459, title: "T", url: "https://github.com/softwarevidal/arthur/pull/5459",
    isDraft: false, headRefName: "b", headRefOid: "abc",
    statusCheckRollup: [{ context: "continuous-integration/jenkins/branch", state: "FAILURE", targetUrl: "https://jenkins/job/team.software/job/github/job/arthur/job/PR-5459/3/display/redirect" }],
    comments: [],
  };
  const run = { name: "SonarCloud Code Analysis", status: "completed", conclusion: "success", details_url: "https://sonarcloud.io/x", output: { summary: PASSED } };
  const s = signalsOf(view, [{ name: "other", output: { summary: "" } }, run], "jcgay");
  assert.equal(s.key, "softwarevidal/arthur#5459");
  assert.equal(s.jenkins.state, "ko");
  assert.equal(s.jenkins.jobPath, "team.software/github/arthur/PR-5459");
  assert.equal(s.jenkins.number, 3);
  assert.deepEqual(s.sonar, { state: "ok", failed: false, issues: 0, hotspots: 0, url: "https://sonarcloud.io/x" });
  assert.equal(s.pending, false);
  assert.equal(s.error, null);
  assert.equal(signalsOf({ ...view, statusCheckRollup: [] }, [], "jcgay").sonar, null);
  assert.equal(signalsOf({ ...view, statusCheckRollup: [{ name: "x", status: "IN_PROGRESS" }] }, [], "jcgay").pending, true);
  assert.equal(s.failing, true);
  assert.equal(s.reported, true);
});

test("signalsOf reads a self-hosted SonarQube check like SonarCloud", () => {
  const view = { repo: "r/a", number: 511, title: "T", url: "u", isDraft: false, headRefName: "b", headRefOid: "abc", comments: [], statusCheckRollup: [] };
  const run = { name: "SonarQube Code Analysis", status: "completed", conclusion: "failure", details_url: "http://build/x",
    output: { summary: "Failed conditions  \n[6 New issues](http://build/issues)  \n" } };
  assert.deepEqual(signalsOf(view, [run], "jcgay").sonar, { state: "ko", failed: true, issues: 6, hotspots: 0, url: "http://build/x" });
});

test("signalsOf: any ko check fails, a ko Jenkins context wins, no check at all is not reported", () => {
  const view = { repo: "r/a", number: 1, title: "T", url: "u", isDraft: false, headRefName: "b", headRefOid: "abc", comments: [] };
  const jk = (name, state, n) => ({ context: `continuous-integration/jenkins/${name}`, state, targetUrl: `https://jenkins/job/a/job/${name}/${n}/` });
  const s = signalsOf({ ...view, statusCheckRollup: [jk("branch", "SUCCESS", 1), jk("pr-merge", "FAILURE", 2)] }, [], "me");
  assert.deepEqual([s.jenkins.state, s.jenkins.number, s.failing], ["ko", 2, true]);
  const other = signalsOf({ ...view, statusCheckRollup: [jk("branch", "SUCCESS", 1), { name: "lint", conclusion: "FAILURE" }] }, [], "me");
  assert.deepEqual([other.jenkins.state, other.failing], ["ok", true]);
  const none = signalsOf({ ...view, statusCheckRollup: [] }, [], "me");
  assert.deepEqual([none.failing, none.reported], [false, false]);
  assert.equal(signalsOf({ ...view, statusCheckRollup: [] }, [{ name: "x" }], "me").reported, true, "a check-run alone reports");
});

test("copied helpers still work", () => {
  assert.equal(checks([{ context: "a", state: "SUCCESS" }])[0].state, "ok");
  assert.equal(jenkinsBuild("nope"), null);
});

// decide: one green PR at head "h1", watched with every launch allowed; each test bends one input.
const green = (over = {}) => ({
  key: "softwarevidal/arthur#5462", repo: "softwarevidal/arthur", number: 5462, url: "https://github.com/softwarevidal/arthur/pull/5462",
  title: "T", branch: "b", head: "h1", draft: false,
  jenkins: { state: "ok", url: "https://jenkins/x/1/", jobPath: "x", number: 1 },
  sonar: { state: "ok", failed: false, issues: 0, hotspots: 0, url: "https://sonarcloud.io/x" },
  pending: false, failing: false, reported: true, markers: new Set(), error: null, ...over,
});
const jenkinsKo = { state: "ko", url: "https://jenkins/x/1/", jobPath: "x", number: 1 };
const sonarKo = (failed) => ({ state: "ko", failed, issues: 2, hotspots: 0, url: "https://sonarcloud.io/x" });
const ALL = new Set(["pr-risk", "pr-demo", "qa"]);
const NO_TAB = { exists: false, running: false };
const RUNNING = { exists: true, running: true };
const DONE = { exists: true, running: false };
const CTX = { on: true, slots: 3, karadocFree: true, hasQa: true };
const at = (over = {}) => ({ ...emptyEntry(), head: "h1", ...over });

test("jenkins ko launches jenkins", () => {
  const r = decide(green({ jenkins: jenkinsKo }), at(), NO_TAB, CTX);
  assert.equal(r.launch, "jenkins");
  assert.equal(r.entry.attempts.jenkins, 1);
  assert.deepEqual(r.entry.launched, { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" });
  assert.equal(r.entry.label, LABELS.running);
  assert.equal(r.entry.url, "https://github.com/softwarevidal/arthur/pull/5462");
  assert.equal(r.entry.title, "T");
  assert.equal(r.toast, null);
});

test("running check waits", () => {
  for (const s of [green({ jenkins: { ...jenkinsKo, state: "running" } }), green({ pending: true }), green({ sonar: { ...sonarKo(false), state: "running" } })]) {
    const r = decide(s, at(), NO_TAB, CTX);
    assert.equal(r.launch, null);
    assert.equal(r.entry.label, "en attente");
  }
});

test("sonar issues on green gate launch sonar", () => {
  const r = decide(green({ sonar: sonarKo(false) }), at(), NO_TAB, CTX);
  assert.equal(r.launch, "sonar");
  assert.equal(r.entry.attempts.sonar, 1);
  assert.equal(r.entry.attempts.jenkins, 0);
});

test("review order risk demo qa", () => {
  assert.equal(decide(green(), at(), NO_TAB, CTX).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), at(), NO_TAB, CTX).launch, "pr-demo");
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), at(), NO_TAB, CTX).launch, "qa");
  const r = decide(green({ markers: ALL }), at(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "ok");
  assert.equal(decide(green(), at(), NO_TAB, CTX).entry.attempts.jenkins, 0, "review launches are not attempts");
});

test("qa skipped without the skill", () => {
  const r = decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), at(), NO_TAB, { ...CTX, hasQa: false });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "ok");
});

test("draft gets no review", () => {
  const r = decide(green({ draft: true }), at(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "brouillon");
  assert.equal(decide(green({ draft: true, jenkins: jenkinsKo }), at(), NO_TAB, CTX).launch, "jenkins", "a draft still gets fixed");
});

test("marker skips a step", () => {
  assert.equal(decide(green({ markers: new Set(["pr-demo"]) }), at({ silent: { h1: ["pr-risk"] } }), NO_TAB, CTX).launch, "qa");
});

test("review tab closed without marker: silent on that head, relaunched on a new head", () => {
  const ended = decide(green(), at({ launched: { step: "pr-demo", head: "h1", tab: "⟳ #5462 pr-demo" } }), NO_TAB, CTX);
  assert.deepEqual(ended.entry.silent, { h1: ["pr-demo"] });
  const markersRisk = new Set(["pr-risk"]);
  assert.equal(decide(green({ markers: markersRisk }), ended.entry, NO_TAB, CTX).launch, "qa");
  assert.equal(decide(green({ markers: markersRisk, head: "h2" }), ended.entry, NO_TAB, CTX).launch, "pr-demo");
  const commented = decide(green({ markers: markersRisk }), at({ launched: { step: "pr-risk", head: "h1", tab: "t" } }), DONE, CTX);
  assert.deepEqual(commented.entry.silent, {}, "a step that left its marker is not silent");
});

test("agent push keeps attempts", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  for (const tab of [RUNNING, DONE]) {
    const r = decide(green({ head: "h2", jenkins: jenkinsKo, sonar: sonarKo(false) }), at({ attempts: { jenkins: 1, sonar: 1 }, launched }), tab, CTX);
    assert.equal(r.entry.attempts.jenkins, tab.running ? 1 : 2);
    assert.equal(r.entry.attempts.sonar, 1);
    assert.equal(r.entry.head, "h2");
  }
});

test("a review tab left open does not own my push", () => {
  const r = decide(green({ head: "h2", jenkins: jenkinsKo }), at({ attempts: { jenkins: 2, sonar: 0 }, launched: demo }), DONE, CTX);
  assert.equal(r.entry.attempts.jenkins, 0);
});

test("draft without any check stays a draft", () => {
  assert.equal(decide(green({ draft: true, jenkins: null, sonar: null, reported: false }), at(), NO_TAB, CTX).entry.label, "brouillon");
});

test("my push resets attempts", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  for (const entry of [at({ attempts: { jenkins: 2, sonar: 2 } }), at({ attempts: { jenkins: 2, sonar: 2 }, launched })]) {
    const r = decide(green({ head: "h2", jenkins: jenkinsKo, sonar: sonarKo(true) }), entry, NO_TAB, CTX);
    assert.equal(r.launch, "jenkins");
    assert.deepEqual(r.entry.attempts, { jenkins: 1, sonar: 0 });
    assert.equal(r.entry.head, "h2");
  }
});

test("third attempt is refused and toasts once", () => {
  const s = green({ jenkins: jenkinsKo });
  let r = decide(s, at(), NO_TAB, CTX);
  r = decide(s, { ...r.entry, launched: null }, NO_TAB, CTX);
  assert.equal(r.launch, "jenkins");
  assert.equal(r.entry.attempts.jenkins, 2);
  r = decide(s, r.entry, NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "à toi");
  assert.equal(r.toast, "PR #5462 : jenkins à toi");
  r = decide(s, r.entry, NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "à toi");
  assert.equal(r.toast, null);
  const green2 = decide(green(), r.entry, NO_TAB, { ...CTX, on: false });
  assert.deepEqual([green2.entry.attempts.jenkins, green2.entry.told.jenkins], [0, false], "back to ok resets attempts and toast");
});

test("sonar at budget with green gate lets review go", () => {
  const atBudget = at({ attempts: { jenkins: 0, sonar: 2 } });
  const r = decide(green({ sonar: sonarKo(false) }), atBudget, NO_TAB, CTX);
  assert.equal(r.launch, "pr-risk");
  assert.equal(r.toast, "PR #5462 : sonar à toi");
  assert.equal(r.entry.attempts.sonar, 2);
  const red = decide(green({ sonar: sonarKo(true) }), atBudget, NO_TAB, CTX);
  assert.equal(red.launch, null);
  assert.equal(red.entry.label, "à toi");
});

test("jenkins at budget blocks everything", () => {
  const r = decide(green({ jenkins: jenkinsKo, sonar: sonarKo(false) }), at({ attempts: { jenkins: 2, sonar: 0 } }), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "à toi");
  assert.equal(r.entry.attempts.sonar, 0);
});

test("vanished tab ends the step", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  const r = decide(green({ jenkins: jenkinsKo }), at({ attempts: { jenkins: 1, sonar: 0 }, launched }), NO_TAB, CTX);
  assert.equal(r.launch, "jenkins");
  assert.equal(r.entry.attempts.jenkins, 2);
  const review = decide(green({ markers: new Set(["pr-risk"]) }), at({ launched: { step: "pr-demo", head: "h1", tab: "t" } }), NO_TAB, CTX);
  assert.equal(review.launch, "qa", "a vanished review tab is never relaunched blindly");
});

test("running tab blocks the PR", () => {
  const launched = { step: "pr-risk", head: "h1", tab: "⟳ #5462 pr-risk" };
  const r = decide(green({ jenkins: jenkinsKo }), at({ launched }), RUNNING, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "agent en cours");
  assert.deepEqual(r.entry.launched, launched);
});

test("off launches nothing", () => {
  const r = decide(green({ jenkins: jenkinsKo }), at(), NO_TAB, { ...CTX, on: false });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
  assert.equal(r.entry.attempts.jenkins, 0);
  assert.equal(r.entry.launched, null);
  const ended = decide(green(), at({ launched: { step: "pr-risk", head: "h1", tab: "t" } }), NO_TAB, { ...CTX, on: false });
  assert.deepEqual(ended.entry.silent, { h1: ["pr-risk"] }, "display keeps updating while off");
});

test("no slot waits", () => {
  const r = decide(green(), at(), NO_TAB, { ...CTX, slots: 0 });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
});

test("karadoc busy holds demo and qa but not pr-risk", () => {
  const busy = { ...CTX, karadocFree: false };
  assert.equal(decide(green(), at(), NO_TAB, busy).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), at(), NO_TAB, busy).launch, null);
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), at(), NO_TAB, busy).entry.label, "en attente");
  assert.equal(decide(green({ jenkins: jenkinsKo }), at(), NO_TAB, busy).launch, "jenkins");
});

test("error launches nothing", () => {
  const r = decide({ ...green({ jenkins: jenkinsKo }), error: "gh: HTTP 502" }, at(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "erreur");
  assert.equal(r.entry.error, "gh: HTTP 502");
  assert.equal(decide(green(), r.entry, NO_TAB, CTX).entry.error, null);
});

test("decide leaves its entry untouched", () => {
  const entry = at({ attempts: { jenkins: 1, sonar: 0 }, launched: { step: "pr-demo", head: "h1", tab: "t" } });
  const before = structuredClone(entry);
  const r = decide(green({ jenkins: jenkinsKo }), entry, DONE, CTX);
  assert.deepEqual(entry, before);
  assert.notEqual(r.entry.attempts, entry.attempts);
  assert.notEqual(r.entry.silent, entry.silent);
});

test("tabName and missing checks", () => {
  assert.equal(tabName(5462, "qa"), "⟳ #5462 qa");
  assert.equal(decide(green({ jenkins: null, sonar: null }), at(), NO_TAB, CTX).launch, "pr-risk");
});

// An agent's push leaves the new head without CI for a while: that window must not reset the budget.
const budgetSurvivesNoReport = (check, ko) => {
  const s = (head, value) => green({ head, [check]: value });
  let r = decide(s("h1", ko), at(), NO_TAB, CTX);
  assert.equal(r.entry.attempts[check], 1);
  r = decide(s("h2", null), r.entry, DONE, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
  assert.equal(r.entry.attempts[check], 1);
  r = decide(s("h2", ko), r.entry, NO_TAB, CTX);
  assert.equal(r.launch, check);
  assert.equal(r.entry.attempts[check], 2);
  r = decide(s("h3", null), r.entry, DONE, CTX);
  assert.equal(r.entry.attempts[check], 2);
  r = decide(s("h3", ko), r.entry, NO_TAB, CTX);
  assert.deepEqual([r.launch, r.entry.label, r.toast], [null, "à toi", `PR #5462 : ${check} à toi`]);
  r = decide(s("h3", ko), r.entry, NO_TAB, CTX);
  assert.equal(r.toast, null);
};

test("agent push then jenkins not reported keeps attempts", () => budgetSurvivesNoReport("jenkins", jenkinsKo));

test("agent push then sonar not reported keeps attempts", () => budgetSurvivesNoReport("sonar", sonarKo(true)));

test("new head without CI yet waits for review", () => {
  const before = decide(green({ markers: ALL }), at(), NO_TAB, CTX).entry;
  assert.deepEqual(before.seen, { jenkins: true, sonar: true });
  const r = decide(green({ head: "h2", jenkins: null, sonar: null }), before, NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
});

test("repo that never had jenkins still gets review", () => {
  const r = decide(green({ jenkins: null }), at(), NO_TAB, CTX);
  assert.equal(r.launch, "pr-risk");
  const old = { ...at() };
  delete old.seen;
  assert.equal(decide(green({ jenkins: null, sonar: null }), old, NO_TAB, CTX).launch, "pr-risk", "old entries without seen");
});

const PR = {
  url: "https://github.com/softwarevidal/arthur/pull/5459", number: 5459, branch: "MERLIN-2320", head: "0123456789abcdef",
  jenkins: { state: "ko", url: "https://jenkins/job/team.software/job/github/job/arthur/job/PR-5459/1/", jobPath: "team.software/github/arthur/PR-5459", number: 1 },
  sonar: { state: "ko", url: "https://sonarcloud.io/dashboard?id=vidal_arthur&pullRequest=5459" },
};

test("promptFor names the PR in every step", () => {
  for (const step of ["jenkins", "sonar", "pr-risk", "pr-demo", "qa"]) assert.match(promptFor(step, PR), /pull\/5459/, step);
});

test("promptFor jenkins reads the log and pushes to the PR branch only", () => {
  const p = promptFor("jenkins", PR);
  assert.match(p, /jk run log team\.software\/github\/arthur\/PR-5459 1/);
  assert.match(p, /jk run rerun team\.software\/github\/arthur\/PR-5459 1/);
  assert.match(p, /git push origin HEAD:refs\/heads\/MERLIN-2320/);
  assert.match(p, /01234567/);
  assert.doesNotMatch(p, /--force/);
});

test("promptFor sonar reads the pull request issues", () => {
  const p = promptFor("sonar", PR);
  assert.match(p, /pullRequest/);
  assert.match(p, /git push origin HEAD:refs\/heads\/MERLIN-2320/);
  assert.doesNotMatch(p, /--force/);
});

test("promptFor review steps run their skill", () => {
  assert.equal(promptFor("pr-risk", PR), `/pr-risk ${PR.url}`);
  assert.equal(promptFor("pr-demo", PR), `/pr-demo ${PR.url}`);
  const qa = promptFor("qa", PR);
  assert.ok(qa.startsWith(`/testing-api-pull-requests ${PR.url}`));
  assert.match(qa, /étape 7/);
});

test("repoOfRemote reads GitHub remotes only", () => {
  assert.equal(repoOfRemote("git@github.com:softwarevidal/arthur.git"), "softwarevidal/arthur");
  assert.equal(repoOfRemote("https://github.com/softwarevidal/arthur"), "softwarevidal/arthur");
  assert.equal(repoOfRemote("https://github.com/softwarevidal/arthur.git\n"), "softwarevidal/arthur");
  assert.equal(repoOfRemote("git@gitlab.vidal.net:team/arthur.git"), null);
  assert.equal(repoOfRemote(""), null);
});

test("undoLaunch gives the attempt back and forgets the launch", () => {
  const before = at({ attempts: { jenkins: 1, sonar: 0 }, launched: { step: "pr-risk", head: "h0", tab: "t" } });
  const r = decide(green({ jenkins: jenkinsKo }), before, NO_TAB, CTX);
  assert.equal(r.launch, "jenkins");
  const undone = undoLaunch(r.entry, "jenkins", "à toi");
  assert.deepEqual([undone.attempts.jenkins, undone.launched, undone.label, undone.error], [1, null, "à toi", null]);
  assert.equal(undone.url, r.entry.url, "keeps what decide learnt of the PR");
  const failed = undoLaunch(decide(green(), at(), NO_TAB, CTX).entry, "pr-risk", "erreur", "fatal: boom");
  assert.deepEqual([failed.attempts, failed.launched, failed.error], [at().attempts, null, "fatal: boom"]);
});

const demo = { step: "pr-demo", head: "h1", tab: "⟳ #5462 pr-demo" };

test("review tab that exists without its marker holds the PR, whatever its status", () => {
  for (const tab of [DONE, RUNNING]) {
    const r = decide(green({ markers: new Set(["pr-risk"]) }), at({ launched: demo }), tab, CTX);
    assert.deepEqual([r.launch, r.entry.label, r.entry.launched, r.entry.silent], [null, "agent en cours", demo, {}]);
  }
});

test("review marker appears: step done, next step goes", () => {
  const r = decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), at({ launched: demo }), DONE, CTX);
  assert.equal(r.launch, "qa");
  assert.deepEqual(r.entry.silent, {});
});

test("fix step still ends when its agent stops working", () => {
  const r = decide(green({ sonar: sonarKo(false) }), at({ launched: { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" } }), DONE, CTX);
  assert.equal(r.launch, "sonar");
});

test("another watch agent of the PR blocks it", () => {
  const r = decide(green({ jenkins: jenkinsKo }), at(), { ...NO_TAB, busy: true }, CTX);
  assert.deepEqual([r.launch, r.entry.label, r.entry.attempts.jenkins], [null, "agent en cours", 0]);
});

test("review waits while any check is ko", () => {
  const r = decide(green({ failing: true }), at(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(decide(green({ failing: true, sonar: sonarKo(false) }), at(), NO_TAB, CTX).launch, "sonar", "sonar is still fixed");
});

test("no check reported on the head: no review", () => {
  const r = decide(green({ jenkins: null, sonar: null, reported: false }), at(), NO_TAB, CTX);
  assert.deepEqual([r.launch, r.entry.label], [null, "en attente"]);
});

test("holdingTabs: working or blocked agents, and review tabs without their marker", () => {
  const markersOf = (n) => ({ 1: new Set(["pr-risk"]), 2: new Set(["pr-risk", "pr-demo"]) })[n] ?? null;
  const got = holdingTabs([
    { name: "⟳ #1 pr-demo", status: "idle" }, // waits for my reply: holds karadoc
    { name: "⟳ #2 pr-demo", status: "done" }, // marker posted: free
    { name: "⟳ #2 jenkins", status: "working" },
    { name: "⟳ #1 jenkins", status: "done" },
    { name: "⟳ #3 qa", status: null }, // PR not watched any more
    { name: "⟳ #1 pr-risk", status: null }, // marker posted, no agent
    { name: "claude", status: "working" },
  ], markersOf);
  assert.deepEqual(got, ["⟳ #1 pr-demo", "⟳ #2 jenkins"]);
});

test("checkoutBases: the commits the watch checked out, not the agent's", () => {
  const reflog = [
    "c3|checkout: moving from c2 to foo",
    "c2|commit: agent",
    "c1|checkout: moving from c0 to origin/MERLIN-1",
    "c9|checkout: moving from c8 to origin/MERLIN-10",
    "c0|",
  ].join("\n");
  assert.deepEqual(checkoutBases(reflog, "MERLIN-1"), ["c1", "c0"]);
  assert.deepEqual(checkoutBases("", "b"), []);
});
