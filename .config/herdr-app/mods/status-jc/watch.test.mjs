// node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSince, sonarFindings, markers, signalsOf, checks, jenkinsBuild, decide, emptyEntry, tabName, LABELS, promptFor, repoOfRemote, undoLaunch, holdingTabs, closing, karadocHeld, checkoutBases, checkoutsOf } from "./watch.js";

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

test("markers keeps only my comments and reviews", () => {
  const c = (login, body) => ({ author: { login }, body });
  const got = markers([c("jcgay", "<!-- pr-risk -->\nx"), c("jcgay", "<!-- testing-api-pull-requests -->\ny"), c("someone", "<!-- pr-demo -->"), c("jcgay", "<!-- pr-review -->\nz")], "jcgay");
  assert.deepEqual(got, new Set(["pr-risk", "qa", "pr-review"]));
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
  assert.ok(signalsOf({ ...view, reviews: [{ author: { login: "jcgay" }, body: "<!-- pr-review -->\nx" }] }, [], "jcgay").markers.has("pr-review"), "a review carries its marker");
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
const ALL = new Set(["pr-risk", "pr-review", "pr-demo", "qa"]);
const NO_TAB = { exists: false, running: false };
const RUNNING = { exists: true, running: true };
const DONE = { exists: true, running: false };
const CTX = { on: true, slots: 3, karadocFree: true, hasQa: true, hasCi: true };
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

test("review order risk review demo qa", () => {
  assert.equal(decide(green(), at(), NO_TAB, CTX).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), at(), NO_TAB, CTX).launch, "pr-review");
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-review"]) }), at(), NO_TAB, CTX).launch, "pr-demo");
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-review", "pr-demo"]) }), at(), NO_TAB, CTX).launch, "qa");
  const r = decide(green({ markers: ALL }), at(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "ok");
  assert.equal(decide(green(), at(), NO_TAB, CTX).entry.attempts.jenkins, 0, "review launches are not attempts");
});

test("qa skipped without the skill", () => {
  const r = decide(green({ markers: new Set(["pr-risk", "pr-review", "pr-demo"]) }), at(), NO_TAB, { ...CTX, hasQa: false });
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
  assert.equal(decide(green({ markers: new Set(["pr-review", "pr-demo"]) }), at({ silent: { h1: ["pr-risk"] } }), NO_TAB, CTX).launch, "qa");
});

test("review tab closed without marker: silent on that head, relaunched on a new head", () => {
  const ended = decide(green(), at({ launched: { step: "pr-demo", head: "h1", tab: "⟳ #5462 pr-demo" } }), NO_TAB, CTX);
  assert.deepEqual(ended.entry.silent, { h1: ["pr-demo"] });
  const markersRisk = new Set(["pr-risk", "pr-review"]);
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
  const review = decide(green({ markers: new Set(["pr-risk", "pr-review"]) }), at({ launched: { step: "pr-demo", head: "h1", tab: "t" } }), NO_TAB, CTX);
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

test("karadoc busy holds demo and qa but not pr-risk nor pr-review", () => {
  const busy = { ...CTX, karadocFree: false };
  assert.equal(decide(green(), at(), NO_TAB, busy).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), at(), NO_TAB, busy).launch, "pr-review");
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-review"]) }), at(), NO_TAB, busy).launch, null);
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-review", "pr-demo"]) }), at(), NO_TAB, busy).entry.label, "en attente");
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
  for (const step of ["jenkins", "sonar", "pr-risk", "pr-review", "pr-demo", "qa"]) assert.match(promptFor(step, PR), /pull\/5459/, step);
});

test("promptFor jenkins reads the log and pushes to the PR branch only", () => {
  const p = promptFor("jenkins", PR);
  assert.match(p, /jk log team\.software\/github\/arthur\/PR-5459 1/);
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
  const review = promptFor("pr-review", PR);
  assert.ok(review.startsWith(`/pr-review ${PR.url} --fix`));
  assert.doesNotMatch(review, /git push/, "fix.md owns the push and its checks");
  const demo = promptFor("pr-demo", PR);
  assert.ok(demo.startsWith(`/pr-demo ${PR.url} --narrate`));
  assert.match(demo, /en français/);
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
  const r = decide(green({ markers: new Set(["pr-risk", "pr-review", "pr-demo"]) }), at({ launched: demo }), DONE, CTX);
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

test("a repo without CI gets its review at once, one with CI waits for it", () => {
  const none = green({ jenkins: null, sonar: null, reported: false });
  const withCi = decide(none, at(), NO_TAB, CTX);
  assert.deepEqual([withCi.launch, withCi.entry.label, withCi.entry.why], [null, "en attente", "aucun check sur ce commit : attente de la CI du repo"]);
  assert.equal(decide(none, at(), NO_TAB, { ...CTX, hasCi: false }).launch, "pr-risk");
  // A PR that had Jenkins waits for it even when the clone shows no CI file.
  assert.equal(decide(none, at({ seen: { jenkins: true, sonar: false } }), NO_TAB, { ...CTX, hasCi: false }).entry.label, "en attente");
  assert.equal(decide(green({ ...none, markers: ALL }), at(), NO_TAB, { ...CTX, hasCi: false }).entry.why, "pas de CI ; faits : pr-risk, pr-review, pr-demo, qa");
});

test("every label says why", () => {
  const why = (s, e = at(), tab = NO_TAB, ctx = CTX) => decide(s, e, tab, ctx).entry.why;
  assert.equal(why(green({ jenkins: { ...jenkinsKo, state: "running" } })), "CI en cours : Jenkins tourne");
  assert.equal(why(green({ sonar: null }), at({ seen: { jenkins: false, sonar: true } })), "CI en cours : Sonar n'a pas encore démarré sur ce commit");
  assert.equal(why(green({ jenkins: jenkinsKo }), at({ attempts: { jenkins: 2, sonar: 0 } })), "Jenkins encore en échec après 2 corrections");
  assert.equal(why(green({ markers: new Set(["pr-risk", "pr-review"]) }), at(), NO_TAB, { ...CTX, karadocFree: false }), "pr-demo à lancer, mais karadoc occupé par un autre pr-demo ou qa");
  assert.equal(why(green(), at(), NO_TAB, { ...CTX, on: false }), "pr-risk à lancer, mais surveillance coupée");
  assert.equal(why(green({ markers: ALL })), "CI verte ; faits : pr-risk, pr-review, pr-demo, qa");
  assert.equal(why(green({ draft: true })), "CI verte, pas de review sur un brouillon");
  assert.equal(why(green(), at({ launched: { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" } }), RUNNING), "agent jenkins lancé sur h1");
  assert.equal(undoLaunch(at(), "pr-risk", "erreur").why, "pr-risk n'a pas pu démarrer");
});

test("holdingTabs: working or blocked agents, and review tabs without their marker", () => {
  const markersOf = (n) => ({ 1: new Set(["pr-risk", "pr-review"]), 2: new Set(["pr-risk", "pr-demo"]) })[n] ?? null;
  const got = holdingTabs([
    { name: "⟳ #1 pr-demo", status: "idle" }, // waits for my reply: holds karadoc
    { name: "⟳ #2 pr-demo", status: "done" }, // marker posted: free
    { name: "⟳ #2 jenkins", status: "working" },
    { name: "⟳ #1 jenkins", status: "done" },
    { name: "⟳ #3 qa", status: null }, // PR not watched any more
    { name: "⟳ #1 pr-risk", status: null }, // marker posted, no agent
    { name: "⟳ #1 pr-review", status: "idle" }, // marker posted, may still fix and push: holds
    { name: "claude", status: "working" },
  ], markersOf);
  assert.deepEqual(got, ["⟳ #1 pr-demo", "⟳ #2 jenkins", "⟳ #1 pr-review"]);
});

test("karadocHeld: pr-demo/qa tabs of a karadoc repo's PR, or of a PR gone from the round", () => {
  const karadoc = new Set([5449]), round = new Set([5449, 48]);
  assert.equal(karadocHeld(["⟳ #5449 qa"], karadoc, round), true);
  assert.equal(karadocHeld(["⟳ #48 pr-demo", "⟳ #5449 pr-risk"], karadoc, round), false, "ordostruct demo, arthur pr-risk");
  assert.equal(karadocHeld(["⟳ #812 qa"], karadoc, round), true, "merged PR whose qa still runs");
});

test("pr-review holds its PR until its tab closes, and its push keeps the budget", () => {
  const launched = { step: "pr-review", head: "h1", tab: "⟳ #5462 pr-review" };
  const marked = new Set(["pr-risk", "pr-review"]);
  const idle = decide(green({ markers: marked }), at({ launched }), DONE, CTX);
  assert.deepEqual([idle.launch, idle.entry.label], [null, LABELS.running], "marker posted, fixes may follow: no pr-demo yet");
  const pushed = decide(green({ markers: marked, head: "h2", jenkins: jenkinsKo }), at({ attempts: { jenkins: 1, sonar: 0 }, launched }), DONE, CTX);
  assert.equal(pushed.entry.attempts.jenkins, 1, "its push is not mine");
  const closed = decide(green({ markers: marked }), at({ launched }), NO_TAB, CTX);
  assert.deepEqual([closed.launch, closed.entry.silent], ["pr-demo", {}]);
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

test("paused PR launches nothing and says why", () => {
  const P = { ...CTX, paused: true };
  const r = decide(green(), at(), NO_TAB, P);
  assert.deepEqual([r.launch, r.entry.label, r.entry.why, r.toast], [null, "en pause", "en pause ; CI verte", null]);
  assert.equal(decide(green({ jenkins: jenkinsKo }), at(), NO_TAB, P).entry.why, "en pause ; un check en échec");
  assert.equal(decide(green({ pending: true }), at(), NO_TAB, P).entry.why, "en pause ; CI en cours");
  assert.equal(decide(green({ jenkins: null, sonar: null, reported: false }), at(), NO_TAB, P).entry.why, "en pause ; aucun check");
});

test("paused PR: running agent finishes, nothing counted, no toast", () => {
  const P = { ...CTX, paused: true };
  const launched = { step: "pr-review", head: "h1", tab: "t" };
  assert.equal(decide(green(), at({ launched }), RUNNING, P).entry.label, LABELS.running);
  const spent = decide(green({ jenkins: jenkinsKo }), at({ attempts: { jenkins: 2, sonar: 0 } }), NO_TAB, P);
  assert.deepEqual([spent.toast, spent.entry.told.jenkins, spent.entry.attempts.jenkins], [null, false, 2]);
  assert.match(decide(green({ jenkins: jenkinsKo }), spent.entry, NO_TAB, CTX).toast, /jenkins à toi/);
});

test("checkoutsOf: folders with the branch checked out, not detached nor prunable", () => {
  const out = [
    "worktree /Volumes/sourcecode/vidal-data-aggregator-intl", "HEAD f01ed62", "branch refs/heads/all-monograph", "",
    "worktree /Volumes/sourcecode/agents-worktree/vidal-data-aggregator-intl/all-monograph-watch", "HEAD 5a67e1d", "detached", "",
    "worktree /Volumes/sourcecode/vidal-data-aggregator-intl-hebdo", "HEAD 40fd2d8", "branch refs/heads/unified-index-fr", "",
    "worktree /tmp/gone", "HEAD 1111111", "branch refs/heads/all-monograph", "prunable gitdir file points to non-existent location", "",
  ].join("\n");
  assert.deepEqual(checkoutsOf(out, "all-monograph"), ["/Volumes/sourcecode/vidal-data-aggregator-intl"]);
  assert.deepEqual(checkoutsOf(out, "all-monograph-2"), [], "a prefix is not the branch");
  assert.deepEqual(checkoutsOf("", "x"), []);
});

test("a finished pr-risk tab closes, its space when alone", () => {
  const tab = (id, name, over = {}) => ({ id, name, status: "done", active: false, panes: 1, ...over });
  const space = (id, tabs, active = false) => ({ id, active, tabs, folder: "/x/agents-worktree/arthur/b-watch" });
  const marked = (n) => (n === 1 ? new Set(["pr-risk"]) : n === 2 ? new Set() : n === 3 ? null : undefined);
  assert.deepEqual(closing([space("s1", [tab("t1", "⟳ #1 pr-risk")])], marked), [{ cmd: "space.close", id: "s1" }]);
  assert.deepEqual(closing([space("s1", [tab("t1", "⟳ #1 pr-risk"), tab("t2", "⟳ #1 pr-review", { status: "working" })])], marked),
    [{ cmd: "tab.close", id: "t1" }]);
  assert.deepEqual(closing([space("s1", [tab("t1", "⟳ #4 pr-risk")])], marked), [{ cmd: "space.close", id: "s1" }], "PR gone from the round");
  for (const sp of [
    space("s1", [tab("t1", "⟳ #1 pr-risk", { status: "working" })]), // still working
    space("s1", [tab("t1", "⟳ #2 pr-risk")]), // no marker yet
    space("s1", [tab("t1", "⟳ #3 pr-risk")]), // markers unknown
    space("s1", [tab("t1", "⟳ #1 pr-risk", { active: true })], true), // I am looking at it
    space("s1", [tab("t1", "⟳ #1 pr-risk", { panes: 2 })]), // I split it
    space("s1", [tab("t1", "⟳ #1 pr-review")]), // pr-review pushes after its marker
  ]) assert.deepEqual(closing([sp], marked), []);
  const seen = [];
  closing([space("s1", [tab("t1", "⟳ #1 pr-risk")])], (n, folder) => { seen.push([n, folder]); return null; });
  assert.deepEqual(seen, [[1, "/x/agents-worktree/arthur/b-watch"]], "the PR is looked up with its space's folder");
});
