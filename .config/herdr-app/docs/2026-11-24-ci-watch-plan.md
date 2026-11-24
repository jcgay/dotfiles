# CI panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third view of the `pr` mod (`view: ci`) listing the last Jenkins build of each long-lived branch of the `softwarevidal` repos I contributed to in the last 7 days, with log / rerun buttons and a "Corriger" button that starts a Claude agent on a `fix/ci-<branch>-<N>` worktree.

**Architecture:** Pure logic in a new `mods/pr/ci-model.js` (branch filter, parsing gh / jk JSON, row state, fix detection, agent prompt), tested by `ci-model.test.mjs`. Fetching, rendering and the Corriger launch in a new `mods/pr/ci.js` (class `Ci`), which `main.js` delegates to when `props().view === "ci"`: `main.js` is already 540 lines, and a separate file keeps the two panels apart. The `jc` layout gains a `ci` block in the `panel-body` stack; `tabs-jc` gains its button; `keys.json` its key.

**Tech Stack:** Herdr mod (gpui-kit / gpui-base, `herdr` module), `gh`, `jk`, `git`, `wt` (worktrunk), `node:test`.

**Spec:** `~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md`

## Global Constraints

- Organisation: `softwarevidal`, hard-coded in one constant `ORG` in `ci-model.js` (made configurable in a later PR).
- Window: 7 days (`>YYYY-MM-DD` of now − 7 days, UTC date).
- Repos: union of `gh search prs --author=@me --merged-at=">D" --owner softwarevidal --json repository --limit 1000` (field `repository.nameWithOwner`) and `gh search commits --author=@me --committer-date=">D" --owner softwarevidal --json repository --limit 1000` (field `repository.fullName`).
- Jobs: `jk job ls team.software/github/<repo name> --json` → `[{name, url, color}]`. Long branches: decoded name is `main`, `master`, `develop`, `sprint-*` or `release/*`. **The job path keeps the raw name**: `team.software/github/vira/release%2Fv4` works with `jk`, `…/release/v4` is a 404. Never pass a decoded name to `jk`.
- Last build: `jk run ls <jobPath> --limit 1 --json` → `{items: [{number, status, result, startTime, durationMs, url}]}`. A job whose last build started more than 7 days ago is not shown.
- Red results: `FAILURE`, `UNSTABLE`, `ABORTED`. Corriger and relance show on a finished red build only.
- Fix branch: `fix/ci-<branch with "/" → "-">-<N>` (`fix/ci-release-v4-12`), based on `origin/<branch>`.
- Refresh: on open, every 60 s while visible, on "rafraîchir". Repos and jobs cached 15 min (forced by "rafraîchir"); last builds read every round. No gh / jk call while the panel is hidden (`visible("ci")`).
- UI text in French, as in the spec's sketch. Empty: « Aucune contribution de toi depuis 7 jours ». Jenkins down: « Jenkins injoignable (VPN ?) ».
- Key: `cmd-shift-i` → `tabs-jc.panel:ci` (free in `keys.json` and `keys.default.json`).
- Commits: Conventional Commits `feat(herdr): …`, on branch `feat/ci-panel` via `yadm` (never `master`); README updates in the same commit as the behavior they describe. Draft PR right after the first commit, then push each commit.

## Review Focus

1. A `release/*` job: the row shows `release/v4`, but `jk run ls`, `jk log`, `jk run rerun` get `…/release%2Fv4`. → Task 1 test `longJobs keeps the raw job name`.
2. A repo with no Jenkins folder (`jk job ls` exits non-zero: 404) must drop out silently, not turn the panel into « Jenkins injoignable ». Only a failure of every `jk` call (VPN off) shows that. → Task 2 behaviour, Task 1 `jenkinsDown` test.
3. A running build (`status` not `completed`, `result` null) is orange and has no Corriger nor relance. → Task 1 `rowState` test.
4. An old fix worktree for build 10 must not hide Corriger on build 12; an open PR from `fix/ci-master-10` does (a fix is under way for that branch). → Task 1 `fixOf` tests.
5. Two clicks on Corriger while the first is still preparing: the second does nothing. → Task 3 (`this.fixing` guard keyed `repo/branch`).

---

### Task 0: Branch, spec and plan

- [ ] **Step 1:** `yadm checkout -b feat/ci-panel`
- [ ] **Step 2:** Commit the spec and this plan: `yadm add ~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md ~/.config/herdr-app/docs/2026-11-24-ci-watch-plan.md && yadm commit` with subject `docs(herdr): design the CI panel of long-lived branches`.
- [ ] **Step 3:** `yadm push -u origin feat/ci-panel`, then open the draft PR (`gh pr create --draft --base master -R <dotfiles repo>`), following `~/.claude/docs/pr-trailer.md` for the `Closes #N` trailer of the commits made before it.

### Task 1: Pure logic (`ci-model.js`)

**Files:**
- Create: `~/.config/herdr-app/mods/pr/ci-model.js`
- Test: `~/.config/herdr-app/mods/pr/ci-model.test.mjs`

**Interfaces:**
- Produces (all exported from `ci-model.js`):
  - `ORG = "softwarevidal"`, `WINDOW_MS = 7 * 86400000`, `JOBS_FOLDER = "team.software/github"`
  - `sinceDate(now: number) -> string` — `"YYYY-MM-DD"` of `now - WINDOW_MS`.
  - `reposOf(prsJson: string, commitsJson: string) -> string[]` — repo **names** (`arthur`, without owner), unique, sorted; tolerant of `""` / invalid JSON (→ contributes nothing).
  - `isLong(branch: string) -> boolean`
  - `longJobs(repo: string, jobLsJson: string) -> {repo, branch, jobPath}[]` — `branch` decoded, `jobPath` = `` `${JOBS_FOLDER}/${repo}/${rawName}` ``.
  - `rowOf(job, runLsJson: string, now: number) -> {repo, branch, jobPath, number, state, result, startTime, durationMs, url} | null` — null when no build or last build older than `WINDOW_MS`.
  - `rowState(run) -> "ok" | "ko" | "running"` — `running` when `status !== "completed"`; `ko` for the red results; else `ok`.
  - `fixBranch(branch: string, number: number) -> string`
  - `fixOf(row, openPrs: {number, headRefName, url}[], worktreeBranches: string[]) -> {pr?: {number, url}, branch?: string} | null`
  - `groups(rows) -> {repo, rows}[]` — repos with a `ko` row first, then by name; rows inside by branch name.
  - `fixPrompt(row) -> string`
  - `jenkinsDown(results: {ok: boolean}[]) -> boolean` — true when there is at least one call and none succeeded.

- [ ] **Step 1: Write the failing tests** in `ci-model.test.mjs` (header comment `// node --test ~/.config/herdr-app/mods/pr/ci-model.test.mjs`, same style as `model.test.mjs`):

```js
test("sinceDate is 7 days back", () => assert.equal(sinceDate(Date.parse("2026-11-24T09:00:00Z")), "2026-11-17"));

test("reposOf unions PR and commit searches", () => {
  const prs = JSON.stringify([{ repository: { nameWithOwner: "softwarevidal/arthur" } }, { repository: { nameWithOwner: "softwarevidal/harnais" } }]);
  const commits = JSON.stringify([{ repository: { fullName: "softwarevidal/docker-lib-karadoc" } }, { repository: { fullName: "softwarevidal/arthur" } }]);
  assert.deepEqual(reposOf(prs, commits), ["arthur", "docker-lib-karadoc", "harnais"]);
  assert.deepEqual(reposOf("", "not json"), []);
});

test("isLong", () => {
  for (const b of ["main", "master", "develop", "sprint-42", "sprint-conciliation", "release/v4"]) assert.ok(isLong(b), b);
  for (const b of ["PR-12", "feat/x", "masterpiece", "sprint", "release"]) assert.ok(!isLong(b), b);
});

test("longJobs keeps the raw job name", () => {
  const ls = JSON.stringify([{ name: "PR-1191" }, { name: "master" }, { name: "release%2Fv4" }, { name: "feat%2Fx" }]);
  assert.deepEqual(longJobs("vira", ls), [
    { repo: "vira", branch: "master", jobPath: "team.software/github/vira/master" },
    { repo: "vira", branch: "release/v4", jobPath: "team.software/github/vira/release%2Fv4" },
  ]);
});

test("rowState and rowOf", () => {
  const now = Date.parse("2026-11-24T09:00:00Z");
  const run = (o) => JSON.stringify({ items: [{ number: 12, status: "completed", result: "SUCCESS", startTime: "2026-11-24T07:00:00Z", durationMs: 1000, url: "u", ...o }] });
  const job = { repo: "vira", branch: "master", jobPath: "p" };
  assert.equal(rowOf(job, run({}), now).state, "ok");
  for (const r of ["FAILURE", "UNSTABLE", "ABORTED"]) assert.equal(rowOf(job, run({ result: r }), now).state, "ko");
  assert.equal(rowOf(job, run({ status: "running", result: null }), now).state, "running");
  assert.equal(rowOf(job, run({ startTime: "2026-11-10T00:00:00Z" }), now), null);
  assert.equal(rowOf(job, JSON.stringify({ items: [] }), now), null);
});

test("fixBranch", () => assert.equal(fixBranch("release/v4", 12), "fix/ci-release-v4-12"));

test("fixOf", () => {
  const row = { branch: "master", number: 12 };
  assert.deepEqual(fixOf(row, [{ number: 5520, headRefName: "fix/ci-master-10", url: "u" }], []), { pr: { number: 5520, url: "u" } });
  assert.deepEqual(fixOf(row, [], ["fix/ci-master-12"]), { branch: "fix/ci-master-12" });
  assert.equal(fixOf(row, [], ["fix/ci-master-10"]), null);
  assert.equal(fixOf(row, [{ number: 1, headRefName: "fix/ci-master-old-1", url: "u" }], []), null); // another branch's prefix
});
```

Also `groups` (a repo with a `ko` row comes before an all-green one alphabetically earlier), `fixPrompt` (contains `jk log <jobPath> <N>`, `jk run rerun <jobPath> <N>`, the fix branch, `--draft`, `--base <branch>`), `jenkinsDown([])` false, `jenkinsDown([{ok:false},{ok:false}])` true, `jenkinsDown([{ok:false},{ok:true}])` false.

Note on `fixOf` with a PR: match `headRefName` against `^fix/ci-<slug>-\d+$` exactly, so `fix/ci-master-old-1` does not count for `master`.

- [ ] **Step 2:** Run `node --test ~/.config/herdr-app/mods/pr/ci-model.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `ci-model.js`. No import from `herdr`. `fixPrompt` copy (French, like status-jc's jenk agent):

```
Le build Jenkins #<N> de <branch> (<repo>) est en échec (<result>). Lis le log avec `jk log <jobPath> <N>` ;
sans VPN, Jenkins est injoignable : dis-le et arrête-toi. Si l'échec vient de l'infrastructure ou d'un test
instable, relance avec `jk run rerun <jobPath> <N>`, ne pousse rien et dis-le. Sinon corrige sur la branche
<fixBranch> où tu es, committe, pousse-la et ouvre une PR brouillon vers <branch>
(`gh pr create --draft --base <branch>`).
```

- [ ] **Step 4:** Run the test. Expected: PASS. Also `node --test ~/.config/herdr-app/mods/*/*.test.mjs`: all pass.
- [ ] **Step 5:** Commit `feat(herdr): add the pure logic of the CI panel` (with `Closes #<PR>` footer).

### Task 2: The view (`ci.js`), its block, button and key

**Files:**
- Create: `~/.config/herdr-app/mods/pr/ci.js`, `~/.config/herdr-app/mods/tabs-jc/ci.svg`
- Modify: `~/.config/herdr-app/mods/pr/main.js` (`init` view choice ~line 64, the 60 s timer ~line 74, `render` start ~line 161), `~/.config/herdr-app/layouts/jc.json` (stack `panel-body`, after the `watch` block), `~/.config/herdr-app/mods/tabs-jc/main.js` (`syncPanel` list ~line 151, `panelButton` children ~line 183), `~/.config/herdr-app/keys.json`

**Interfaces:**
- Consumes: Task 1 exports; from `main.js`: `visible(view)` (pass it in, `ci.js` must not import `main.js`), `minutes` from `./model.js`.
- Produces: `export class Ci { constructor(); refresh(cx, force = false); render(cx, t) -> element; fix(cx, row) }` in `ci.js`. `fix` is a stub in this task (Task 3 fills it).

- [ ] **Step 1:** `main.js`: `this.view` accepts `"ci"`; when `ci`, `init` creates `this.ci = new Ci()` and the 60 s timer calls `this.ci.refresh(cx)` when `visible("ci")`; `render` returns `this.ci.render(cx, theme())` wrapped in the same outer frame as the other views (rounded, border, header with title « CI des branches longues », age of last refresh, and a « rafraîchir » link calling `refresh(cx, true)`), and calls `refresh` when the panel becomes shown (same `shown && !this.shown` pattern as `pr`).
- [ ] **Step 2:** `ci.js` `refresh`: one round at a time (`this.loading` guard). Steps:
  1. repos (cached 15 min unless `force`): both `gh search` calls in parallel through `exec(…, {timeout: 30000})`, then `reposOf`.
  2. jobs (same cache): `jk job ls` per repo in parallel; a non-zero exit is recorded `{ok:false}` and the repo dropped.
  3. builds: `jk run ls <jobPath> --limit 1 --json` per job, in parallel; `rowOf` each.
  4. open fix PRs and worktrees, per repo with a `ko` row only: `gh pr list -R softwarevidal/<repo> --state open --json number,headRefName,url --limit 100`; worktree branches from `git -C <clone> worktree list --porcelain` when a clone is known (Task 3's `findClone`; until then `[]`).
  5. `this.error = jenkinsDown(allJkResults) ? "Jenkins injoignable (VPN ?)" : null`; `this.groups = groups(rows)`; `this.at = Date.now()`; `cx.notify()`.
  A gh failure shows its first stderr line as `this.error`.
- [ ] **Step 3:** `ci.js` `render`: the spec's sketch. Per repo a title line; per row a dot drawn like the `dot` helper of `pr/main.js` render (~line 167): ok `t.done` filled, ko `t.ansi1` filled, running `t.working` border with `.loop("opacity", { from: 0.3, to: 1, period: 1200 })`; branch, `#N`, result in French (`ok`, `échec`, `instable`, `abandonné`, `en cours`), age via `minutes(now - startTime)` or running duration. Row click: `exec("open", [row.url])`. Buttons on `ko`: log (`exec("open", [row.url + "console"])`), relance (`jk run rerun <jobPath> <N>` with the same progress / error note as `act` in `main.js`), and either « Corriger » (→ `fix`) or « fix en cours → #N » / « fix en cours » from `fixOf` (click: the PR URL; space selection comes in Task 3). Empty state and error line from the spec.
- [ ] **Step 4:** Layout: add `{ "id": "ci", "type": "block", "content": { "mod": "pr", "props": { "view": "ci" } } }` to `panel-body` after `watch`. `tabs-jc`: add `"ci"` to the `syncPanel` list and `.child(panelButton("ci", "mods/tabs-jc/ci.svg", "CI des branches longues"))` after the watch button. `ci.svg`: a 16×16 stroke icon in the style of `watch.svg` (a branch with a check mark). `keys.json` `global`: `"cmd-shift-i": "tabs-jc.panel:ci"`.
- [ ] **Step 5: Verify:** `herdr-app check ~/.config/herdr-app/mods/pr` and `…/tabs-jc` pass; `herdr-app status` shows no `layout.error` / `keys.error`; `yadm diff ~/.config/herdr-app/layouts/jc.json` shows only the `ci` block. In the app: `⌘⇧I` opens the panel; with VPN, rows appear for today's repos (arthur, harnais, ordostruct… if they have long-branch builds this week); `herdr-app shot /tmp/…png` to check the look. Without VPN, « Jenkins injoignable (VPN ?) ».
- [ ] **Step 6:** Update `mods/pr/README.md` (new section « CI des branches longues »: what you see, where data comes from, the refresh rule; files table gains `ci.js`, `ci-model.js`, `ci-model.test.mjs`), `mods/tabs-jc/README.md` (the button and key), `~/.config/herdr-app/README.md` (key cheatsheet, `jc` layout). Commit `feat(herdr): show long-lived branch builds in a CI panel`.

### Task 3: Corriger

**Files:**
- Modify: `~/.config/herdr-app/mods/pr/ci.js`

**Interfaces:**
- Consumes: `fixBranch`, `fixPrompt`, `fixOf` (Task 1); `Ci.fix(cx, row)` stub (Task 2).
- Produces: `findClone(repo: string) -> Promise<string | null>` in `ci.js` (copy of status-jc's `findClone`, reduced to: local spaces' folders, their panes' cwds, `~/dev/<repo>`; a folder counts when `git remote get-url origin` matches `github.com[:/]softwarevidal/<repo>`). Copy, don't import: mods cannot import each other.

- [ ] **Step 1:** `fix(cx, row)`: guard `this.fixing[repo/branch]` (Review Focus 5), note « ouverture… » under the row. Then: `findClone` (null → error « aucun clone local de <repo> »); `git fetch origin <branch>`; if `git worktree list --porcelain` already has `fixBranch(row)`, reuse its folder; else `wt switch --create <fix> --base origin/<branch> --no-cd` in the clone (timeout 600000), then read the folder from the porcelain list. A space already showing that folder → `space.select`; else `run("space.new", { folder, tab: "ci " + row.branch, argv: ["claude"], task: fixPrompt(row) })`. Errors: first stderr line under the row, kept 5 min.
- [ ] **Step 2:** « fix en cours » click: select the space showing the fix worktree when one does, else open the PR URL. Task 2's step 4 of `refresh` now uses `findClone` for worktree branches.
- [ ] **Step 3: Verify:** `herdr-app check ~/.config/herdr-app/mods/pr`. By hand, on a real red build of a listed repo (find one with `jk search --folder team.software/github/<repo> --filter result=FAILURE --since 7d`; if none is red this week, say so in the report and stop at the check): Corriger opens a space named after the repo with a `ci <branch>` tab running Claude on `fix/ci-<branch>-<N>`; a second click while preparing does nothing; after it exists, the row shows « fix en cours ». Remove the test worktree afterwards (`wt remove`).
- [ ] **Step 4:** README: the Corriger paragraph in `mods/pr/README.md`. Commit `feat(herdr): start a Claude agent on a red long-lived branch build`.

### Task 4: Final checks and docs

- [ ] **Step 1:** `node --test ~/.config/herdr-app/mods/*/*.test.mjs` all pass; `herdr-app check` on `pr` and `tabs-jc` pass.
- [ ] **Step 2:** `~/.config/CLAUDE.md`, Herdr section: name the CI panel among the `pr` mod's views (one sentence), and `cmd-shift-i`. Reread every README the branch touched against the final behavior.
- [ ] **Step 3:** Commit `docs(herdr): name the CI panel in the dotfiles guide` if anything changed; push.
