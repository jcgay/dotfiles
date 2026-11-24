# Herdr config per machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read GitHub owners, Jenkins, Jira and QA Docker settings from one `~/.config/herdr-app/config.json` rendered by yadm per class, and give the CI panel a GitHub Actions source.

**Architecture:** A yadm template renders `config.json`. Each mod (`status-jc`, `pr`, `start-work`) reads it with `readTextFile(`${appHome()}/config.json`)` at each round and validates it with a pure function copied in its own pure module (mods cannot import each other). The CI panel picks Jenkins when `config.jenkins` exists, else `gh run list`.

**Tech Stack:** Herdr mods (JS, gpui-kit), `gh`, `jk`, `node --test`, yadm templates.

**Spec:** `~/.config/herdr-app/docs/2026-11-24-herdr-config-design.md`

## Global Constraints

- Config error text, everywhere: `config.json absent ou invalide : lance yadm alt`.
- Valid config: a JSON object whose `owners` is a non-empty array of non-empty strings (`start-work` only needs valid JSON).
- Work values: `owners: ["softwarevidal"]`, `jenkins: { folder: "team.software/github" }`, `jira: { url: "https://vidalgroup.atlassian.net", me: "jean-christophe.gay@vidal.fr" }`, `dockerQa: true`. Personal: `owners: ["jcgay"]` only.
- yadm template: multi-line `{% if yadm.class == "Work" %}` / `{% else %}` / `{% endif %}` only.
- Pure modules import nothing from Herdr. Run all tests: `node --test ~/.config/herdr-app/mods/*/*.test.mjs`.
- Commits: Conventional Commits `feat(herdr): …`, footer `Closes #89` then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `yadm`, push after each commit. Each commit updates the READMEs it touches.

## Review Focus

- Config missing while an armed merge or a squash is pending: no `gh` call at all from status-jc; the registry stays as is (Task 2 test on the gate helper).
- Two owners with a repo of the same name: rows and clones keyed by `owner/name` (Task 3 test on `reposOf`).
- A branch whose latest run of workflow A is green and of workflow B red: row is red, rerun targets B only (Task 4 test).
- An Actions run still in progress next to an older red run of another workflow: row is red (ko wins over running) (Task 4 test).
- Runs older than 7 days only: the repo drops out (Task 4 test).

---

### Task 1: The config template

**Files:**
- Create: `~/.config/herdr-app/config.json##template`
- Modify: `~/.gitignore` (add `/.config/herdr-app/config.json` with the same two-line comment as the other rendered files)

- [ ] **Step 1:** Write the template with the Work and Personal objects of Global Constraints.
- [ ] **Step 2:** `yadm alt && node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.config/herdr-app/config.json","utf8")).owners)'` → `[ 'softwarevidal' ]`; `yadm status` does not list `config.json`.
- [ ] **Step 3:** Folded into Task 2's commit (nothing reads it yet).

### Task 2: status-jc reads its owners from the config

**Files:**
- Modify: `mods/status-jc/watch.js` (add `CONFIG_ERROR`, `parseConfig`, `ownerArgs`)
- Modify: `mods/status-jc/watcher.js:232` (owners), `round` signature
- Modify: `mods/status-jc/main.js` (read config; gate `watch`, `merge`, `open`, `squash`)
- Modify: `mods/status-jc/README.md`, `mods/pr/main.js` help text is Task 3
- Test: `mods/status-jc/watch.test.mjs`

**Interfaces:**
- Produces: `CONFIG_ERROR: string`; `parseConfig(text: string | null) -> { config: object } | { error: string }`; `ownerArgs(owners: string[]) -> string[]` (`["--owner=a", "--owner=b"]`); `round(registry, cache, owners: string[])`.

- [ ] **Step 1: Failing tests** in `watch.test.mjs`:
  - `parseConfig(null)`, `parseConfig("{")`, `parseConfig('{"owners":[]}')`, `parseConfig('{"owners":[""]}')` → `{ error: CONFIG_ERROR }`.
  - `parseConfig('{"owners":["a"],"jira":{}}')` → `{ config: { owners: ["a"], jira: {} } }`.
  - `ownerArgs(["a","b"])` → `["--owner=a","--owner=b"]`.
- [ ] **Step 2:** `node --test mods/status-jc/watch.test.mjs` → FAIL (not exported).
- [ ] **Step 3:** Implement in `watch.js`. In `watcher.js`, `round(registry, cache, owners)` passes `owners` to `roundUnderLease`, whose search uses `...ownerArgs(owners)` instead of `--owner=softwarevidal`. In `main.js`, an async `config()` reads `${appHome()}/config.json` (import `appHome`) and returns `parseConfig(text)`. `watch` awaits it first: on error, `next = { ...(shared(WATCH) ?? FRESH), error: CONFIG_ERROR, at: Date.now() }` with no round; else `round(..., this, config.owners)`. `merge`, `open`, `squash` return before their `*Round` call when `config()` gives an error.
- [ ] **Step 4:** All tests pass.
- [ ] **Step 5:** README: the search line says `--owner` per owner of `config.json`, and a missing config stops every loop. Commit with Task 1: `feat(herdr): read the watched GitHub owners from a per-class config`.

### Task 3: pr reads owners, Jenkins folder and dockerQa from the config

**Files:**
- Modify: `mods/pr/ci-model.js` (drop `ORG`, `JOBS_FOLDER`; add `CONFIG_ERROR`, `parseConfig` (same as Task 2, comment "copied from status-jc/watch.js: a mod cannot import another's"); `reposOf` keeps `owner/name`; `longJobs(repo, json, folder)`)
- Modify: `mods/pr/ci.js`, `mods/pr/main.js`, `mods/pr/README.md`, `~/.config/herdr-app/README.md`
- Test: `mods/pr/ci-model.test.mjs`

**Interfaces:**
- Consumes: the config shape of Global Constraints.
- Produces: `reposOf(prs, commits) -> string[]` of `owner/name`, sorted; `longJobs(repo: "owner/name", json, folder) -> [{repo, branch, jobPath: `${folder}/${name}/${rawJob}`}]`; `parseConfig`, `CONFIG_ERROR` as Task 2; `repoLabel(repo: string, owners: string[]) -> string` (name alone when one owner, else `owner/name`).

- [ ] **Step 1: Failing tests:** update `reposOf` expectation to `["softwarevidal/arthur", "softwarevidal/docker-lib-karadoc", "softwarevidal/harnais"]` and add a case with `a/x` and `b/x` → both kept; `longJobs("softwarevidal/arthur", json, "team.software/github")` jobPath `team.software/github/arthur/release%2Fv4`; `parseConfig` cases as Task 2; `repoLabel("o/r", ["o"]) === "r"`, `repoLabel("o/r", ["o","p"]) === "o/r"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `Ci.round` reads the config first (on error: `this.error = CONFIG_ERROR`, return); searches take `...owners.flatMap((o) => ["--owner", o])`; `jk job ls ${folder}/${name}`; `gh pr list -R ${repo}`; `findClone(repo)` uses the name for paths and compares `remoteRepo(...) === repo`. Group headers show `repoLabel`. `main.js`: keep the last parsed config in `this.config` (read at init and at each PR refresh); the watch help says « Tes PR ouvertes de <owners joined by ", "> touchées depuis 7 jours, … »; `containers()` returns `[]` without exec unless `this.config?.dockerQa`.
- [ ] **Step 4:** All tests pass; `herdr-app check ~/.config/herdr-app/mods/pr`.
- [ ] **Step 5:** READMEs: « dépôts de `softwarevidal` » → « dépôts des propriétaires de `config.json` », scan Docker only with `dockerQa`. Commit `feat(herdr): read the CI panel's owners and Jenkins folder from the config`.

### Task 4: GitHub Actions source for the CI panel

**Files:**
- Modify: `mods/pr/ci-model.js`, `mods/pr/ci.js`, `mods/pr/README.md`, `~/.config/herdr-app/README.md`
- Test: `mods/pr/ci-model.test.mjs`

**Interfaces:**
- Produces: `RUN_FIELDS = "databaseId,headBranch,workflowName,status,conclusion,createdAt,startedAt,updatedAt,url"`; `actionsRows(repo, runListJson, now) -> Row[]`, where Row is `{ repo, branch, number, state, result, startTime, durationMs, url, red: [{ id, workflow }] }`; `fixPrompt(row)` handles both sources (Actions when `row.red` exists).

Rules for `actionsRows`: keep long branches (`isLong`) and runs with `now - createdAt <= WINDOW_MS`; per branch, the latest run (by `createdAt`) of each workflow. Result map: `success`→`SUCCESS`; `failure`, `timed_out`, `startup_failure`→`FAILURE`; `cancelled`→`ABORTED`; else `null`. Per-run state through the existing `rowState({ status, result })`. Row state: `ko` if any, else `running`, else `ok`, else `idle`. Row's run = most recent red run, else the most recent run: `number` = its `databaseId`, `url`, `result`, `startTime` = `Date.parse(startedAt ?? createdAt)`, `durationMs` = `updatedAt - startedAt` when completed, else 0. `red` = every red run of the branch.

- [ ] **Step 1: Failing tests:**
  - one branch `main`, workflow A success (newer), workflow B failure → one row, `state: "ko"`, `number` = B's id, `red: [{ id: B, workflow: "B" }]`.
  - workflow A `in_progress` + workflow B older failure → `ko`.
  - a feature branch and a run older than 7 days → no row.
  - two runs of A on main, the newer success, the older failure → `ok`, `red: []`.
  - `fixPrompt` on an Actions row contains `gh run view <id> -R <repo> --log-failed`, `gh run rerun <id> -R <repo> --failed`, `fix/ci-main-<id>`, `gh pr create --draft --base main`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. In `ci.js`, without `config.jenkins`: after the repo search, `gh run list -R <repo> --limit 100 --json RUN_FIELDS` per repo every round; rows from `actionsRows`; no `jk`, no « Jenkins injoignable »; the list is cached when both searches answered. Rerun on an Actions row runs `gh run rerun <id> -R <repo> --failed` for each `red` id (note « relancé » when all succeeded). Log icon opens `r.url` (Actions) or `${r.url}console` (Jenkins). Tooltips say « build » for both (« Ouvrir le build », « Log », « Relancer »).
- [ ] **Step 4:** All tests pass; `herdr-app check ~/.config/herdr-app/mods/pr`.
- [ ] **Step 5:** READMEs: the CI panel reads GitHub Actions when `config.json` has no `jenkins`. Commit `feat(herdr): read GitHub Actions runs in the CI panel without Jenkins`.

### Task 5: start-work's Jira from the config

**Files:**
- Modify: `mods/start-work/lib.js` (add `CONFIG_ERROR`, `jiraOf`), `work.js`, `main.js`, `README.md`
- Test: `mods/start-work/lib.test.mjs`

**Interfaces:**
- Produces: `jiraOf(text: string | null) -> { jira: { url, me } | null, error: string | null }` (`error` = `CONFIG_ERROR` when null or invalid JSON; `jira` null when absent); `myName(jira)`; `start(state, cx, phase)` reads `state.jira`.

- [ ] **Step 1: Failing tests:** `jiraOf(null)` → `{ jira: null, error: CONFIG_ERROR }`; `jiraOf('{"owners":["a"]}')` → `{ jira: null, error: null }`; `jiraOf('{"jira":{"url":"u","me":"m"}}')` → `{ jira: { url: "u", me: "m" }, error: null }`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `work.js`: drop `ME`, `JIRA`; `myName(jira)`, `transitions(jira, key)`, `take(jira, key, main, notes)` use `jira.me` / `jira.url`; comment that the `jira` CLI reads its own `~/.config/.jira/.config.yml`. `main.js load`: read `${appHome()}/config.json`, keep `this.jira`; call `myName` only with it; without it, `this.ctx.projects = []`, the key query makes no Jira call, the Jira-project note is not shown, the placeholder is « #issue ou #PR, ou décris le travail »; on `error`, add it to the notes.
- [ ] **Step 4:** All tests pass; `herdr-app check ~/.config/herdr-app/mods/start-work`.
- [ ] **Step 5:** README + `~/.config/CLAUDE.md` (config.json in « Herdr desktop app »). Commit `feat(herdr): take start-work's Jira settings from the config`.
