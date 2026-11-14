// node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchSince, sonarFindings, markers, signalsOf, checks, jenkinsBuild } from "./watch.js";

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
