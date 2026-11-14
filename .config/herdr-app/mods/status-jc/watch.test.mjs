// node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSince, sonarFindings, markers, signalsOf, checks, jenkinsBuild, decide, emptyEntry, tabName, LABELS } from "./watch.js";

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
  pending: false, markers: new Set(), error: null, ...over,
});
const jenkinsKo = { state: "ko", url: "https://jenkins/x/1/", jobPath: "x", number: 1 };
const sonarKo = (failed) => ({ state: "ko", failed, issues: 2, hotspots: 0, url: "https://sonarcloud.io/x" });
const ALL = new Set(["pr-risk", "pr-demo", "qa"]);
const NO_TAB = { exists: false, running: false };
const RUNNING = { exists: true, running: true };
const DONE = { exists: true, running: false };
const CTX = { on: true, slots: 3, karadocFree: true, hasQa: true };
const seen = (over = {}) => ({ ...emptyEntry(), head: "h1", ...over });

test("jenkins ko launches jenkins", () => {
  const r = decide(green({ jenkins: jenkinsKo }), seen(), NO_TAB, CTX);
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
    const r = decide(s, seen(), NO_TAB, CTX);
    assert.equal(r.launch, null);
    assert.equal(r.entry.label, "en attente");
  }
});

test("sonar issues on green gate launch sonar", () => {
  const r = decide(green({ sonar: sonarKo(false) }), seen(), NO_TAB, CTX);
  assert.equal(r.launch, "sonar");
  assert.equal(r.entry.attempts.sonar, 1);
  assert.equal(r.entry.attempts.jenkins, 0);
});

test("review order risk demo qa", () => {
  assert.equal(decide(green(), seen(), NO_TAB, CTX).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), seen(), NO_TAB, CTX).launch, "pr-demo");
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), seen(), NO_TAB, CTX).launch, "qa");
  const r = decide(green({ markers: ALL }), seen(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "ok");
  assert.equal(decide(green(), seen(), NO_TAB, CTX).entry.attempts.jenkins, 0, "review launches are not attempts");
});

test("qa skipped without the skill", () => {
  const r = decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), seen(), NO_TAB, { ...CTX, hasQa: false });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "ok");
});

test("draft gets no review", () => {
  const r = decide(green({ draft: true }), seen(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "brouillon");
  assert.equal(decide(green({ draft: true, jenkins: jenkinsKo }), seen(), NO_TAB, CTX).launch, "jenkins", "a draft still gets fixed");
});

test("marker skips a step", () => {
  assert.equal(decide(green({ markers: new Set(["pr-demo"]) }), seen({ silent: { h1: ["pr-risk"] } }), NO_TAB, CTX).launch, "qa");
});

test("silent step not relaunched on same head but relaunched on new head", () => {
  const ended = decide(green(), seen({ launched: { step: "pr-demo", head: "h1", tab: "⟳ #5462 pr-demo" } }), DONE, CTX);
  assert.deepEqual(ended.entry.silent, { h1: ["pr-demo"] });
  const markersRisk = new Set(["pr-risk"]);
  assert.equal(decide(green({ markers: markersRisk }), ended.entry, NO_TAB, CTX).launch, "qa");
  assert.equal(decide(green({ markers: markersRisk, head: "h2" }), ended.entry, NO_TAB, CTX).launch, "pr-demo");
  const commented = decide(green({ markers: markersRisk }), seen({ launched: { step: "pr-risk", head: "h1", tab: "t" } }), DONE, CTX);
  assert.deepEqual(commented.entry.silent, {}, "a step that left its marker is not silent");
});

test("agent push keeps attempts", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  for (const tab of [RUNNING, DONE]) {
    const r = decide(green({ head: "h2", jenkins: jenkinsKo, sonar: sonarKo(false) }), seen({ attempts: { jenkins: 1, sonar: 1 }, launched }), tab, CTX);
    assert.equal(r.entry.attempts.jenkins, tab.running ? 1 : 2);
    assert.equal(r.entry.attempts.sonar, 1);
    assert.equal(r.entry.head, "h2");
  }
});

test("my push resets attempts", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  for (const entry of [seen({ attempts: { jenkins: 2, sonar: 2 } }), seen({ attempts: { jenkins: 2, sonar: 2 }, launched })]) {
    const r = decide(green({ head: "h2", jenkins: jenkinsKo, sonar: sonarKo(true) }), entry, NO_TAB, CTX);
    assert.equal(r.launch, "jenkins");
    assert.deepEqual(r.entry.attempts, { jenkins: 1, sonar: 0 });
    assert.equal(r.entry.head, "h2");
  }
});

test("third attempt is refused and toasts once", () => {
  const s = green({ jenkins: jenkinsKo });
  let r = decide(s, seen(), NO_TAB, CTX);
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
  const atBudget = seen({ attempts: { jenkins: 0, sonar: 2 } });
  const r = decide(green({ sonar: sonarKo(false) }), atBudget, NO_TAB, CTX);
  assert.equal(r.launch, "pr-risk");
  assert.equal(r.toast, "PR #5462 : sonar à toi");
  assert.equal(r.entry.attempts.sonar, 2);
  const red = decide(green({ sonar: sonarKo(true) }), atBudget, NO_TAB, CTX);
  assert.equal(red.launch, null);
  assert.equal(red.entry.label, "à toi");
});

test("jenkins at budget blocks everything", () => {
  const r = decide(green({ jenkins: jenkinsKo, sonar: sonarKo(false) }), seen({ attempts: { jenkins: 2, sonar: 0 } }), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "à toi");
  assert.equal(r.entry.attempts.sonar, 0);
});

test("vanished tab ends the step", () => {
  const launched = { step: "jenkins", head: "h1", tab: "⟳ #5462 jenkins" };
  const r = decide(green({ jenkins: jenkinsKo }), seen({ attempts: { jenkins: 1, sonar: 0 }, launched }), NO_TAB, CTX);
  assert.equal(r.launch, "jenkins");
  assert.equal(r.entry.attempts.jenkins, 2);
  const review = decide(green({ markers: new Set(["pr-risk"]) }), seen({ launched: { step: "pr-demo", head: "h1", tab: "t" } }), NO_TAB, CTX);
  assert.equal(review.launch, "qa", "a vanished review tab is never relaunched blindly");
});

test("running tab blocks the PR", () => {
  const launched = { step: "pr-risk", head: "h1", tab: "⟳ #5462 pr-risk" };
  const r = decide(green({ jenkins: jenkinsKo }), seen({ launched }), RUNNING, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "agent en cours");
  assert.deepEqual(r.entry.launched, launched);
});

test("off launches nothing", () => {
  const r = decide(green({ jenkins: jenkinsKo }), seen(), NO_TAB, { ...CTX, on: false });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
  assert.equal(r.entry.attempts.jenkins, 0);
  assert.equal(r.entry.launched, null);
  const ended = decide(green(), seen({ launched: { step: "pr-risk", head: "h1", tab: "t" } }), DONE, { ...CTX, on: false });
  assert.deepEqual(ended.entry.silent, { h1: ["pr-risk"] }, "display keeps updating while off");
});

test("no slot waits", () => {
  const r = decide(green(), seen(), NO_TAB, { ...CTX, slots: 0 });
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "en attente");
});

test("karadoc busy holds demo and qa but not pr-risk", () => {
  const busy = { ...CTX, karadocFree: false };
  assert.equal(decide(green(), seen(), NO_TAB, busy).launch, "pr-risk");
  assert.equal(decide(green({ markers: new Set(["pr-risk"]) }), seen(), NO_TAB, busy).launch, null);
  assert.equal(decide(green({ markers: new Set(["pr-risk", "pr-demo"]) }), seen(), NO_TAB, busy).entry.label, "en attente");
  assert.equal(decide(green({ jenkins: jenkinsKo }), seen(), NO_TAB, busy).launch, "jenkins");
});

test("error launches nothing", () => {
  const r = decide({ ...green({ jenkins: jenkinsKo }), error: "gh: HTTP 502" }, seen(), NO_TAB, CTX);
  assert.equal(r.launch, null);
  assert.equal(r.entry.label, "erreur");
  assert.equal(r.entry.error, "gh: HTTP 502");
  assert.equal(decide(green(), r.entry, NO_TAB, CTX).entry.error, null);
});

test("decide leaves its entry untouched", () => {
  const entry = seen({ attempts: { jenkins: 1, sonar: 0 }, launched: { step: "pr-demo", head: "h1", tab: "t" } });
  const before = structuredClone(entry);
  const r = decide(green({ jenkins: jenkinsKo }), entry, DONE, CTX);
  assert.deepEqual(entry, before);
  assert.notEqual(r.entry.attempts, entry.attempts);
  assert.notEqual(r.entry.silent, entry.silent);
});

test("tabName and missing checks", () => {
  assert.equal(tabName(5462, "qa"), "⟳ #5462 qa");
  assert.equal(decide(green({ jenkins: null, sonar: null }), seen(), NO_TAB, CTX).launch, "pr-risk");
});
