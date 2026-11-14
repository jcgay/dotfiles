# PR watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 5 minutes, watch my recent open softwarevidal PRs and start visible Claude agents to fix Jenkins, fix Sonar, then run `pr-risk`, `pr-demo` and the API QA; show the watch's state in the PR panel.

**Architecture:** A mod cannot import another mod's files (`herdr-app check`: "resolves outside the application directory", checked 2026-11-14), so the watch lives entirely in `mods/status-jc/`, which the `jc` layout always shows: `watch.js` holds every decision with no Herdr import (tested with `node:test`), `watcher.js` runs one round of side effects (gh, git, Herdr commands). The registry is `shared("pr-watch")`: persisted by Herdr, readable by every mod, re-renders them on change. The PR panel (`mods/pr/`) only reads it and flips its `on` switch.

**Tech Stack:** Herdr 0.1.15 mods (gpui-kit JS, `herdr` module), `gh`, `git`, Claude Code.

**Spec:** `~/.config/herdr-app/docs/2026-11-14-pr-watch-design.md` (read it first; this plan does not repeat its reasons).

## Global Constraints

- Edit only the clones `mods/status-jc/` and `mods/pr/` (and the design doc). Never `workspace-status`, `main` or other shipped mods/layouts.
- No `setTimeout`/`setInterval`: `cx.timer.every` / `cx.timer.after`. Every program through `exec(cmd, args, { cwd, timeout })`, inside `cx.spawn`. Never keep a `cx`.
- `watch.js` imports nothing from `herdr`, `gpui-kit`, `gpui-base` (plain Node 24 loads it).
- PR list: `gh search prs --author=@me --state=open --owner=softwarevidal --updated=">=<today − 7 days, YYYY-MM-DD>"`.
- Round period: 300000 ms. Max 3 running watch agents; max 1 running `pr-demo`/`qa` agent overall; one running agent per PR. Budget: 2 attempts per check (`jenkins`, `sonar`) per PR.
- Watch worktree: `~/dev/agents-worktree/<repo>/<branch>-watch`, detached on `origin/<branch>`, created with `git worktree add --detach`. Never touch any other worktree.
- Agent push: `git push origin HEAD:refs/heads/<branch>` only; never `--force`.
- Markers (comment by me, body starts with): `<!-- pr-risk -->`, `<!-- pr-demo -->`, `<!-- testing-api-pull-requests -->`.
- Watch tab names: `⟳ #<number> <step>` (e.g. `⟳ #5462 jenkins`); steps are `jenkins`, `sonar`, `pr-risk`, `pr-demo`, `qa`.
- UI copy in French. Commits in the dotfiles repo with `rtk proxy yadm`, Conventional Commits (`feat(herdr): …`), body explaining why, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `yadm add` a whole mod folder (`gpui-kit.d.ts`, `jsconfig.json` stay out).
- After every change: `herdr-app check ~/.config/herdr-app/mods/<mod>` passes and `node --test ~/.config/herdr-app/mods/*/*.test.mjs` passes.

## Review Focus

1. The agent's own push must not reset its budget: a head commit that appears while its watch tab exists (any status, `done` included) keeps the attempt count (Task 2 test `agent push keeps attempts`).
2. gh fails (offline, VPN, rate limit, logged out) or a PR's `gh pr view` fails: the round records `error` for that PR or the whole round, launches nothing on unknown data, and the panel shows the error line (Task 3 test of `decide` with `pr.error`; Task 4 shows it).
3. Herdr restart or layout switch mid-flight: the registry survives in `shared`, a launched step whose tab no longer exists is treated as finished, never relaunched blindly (Task 2 test `vanished tab ends the step`).
4. The watch worktree left dirty or with unpushed commits by a previous agent: no launch, PR goes `à toi` (Task 3, `prepareWorktree` returns `dirty`).
5. Turning the watch off from the panel while agents run: nothing new starts, running agents are left alone, display keeps updating (Task 2 test `off launches nothing`).

---

### Task 1: Signals from GitHub

**Files:**
- Create: `~/.config/herdr-app/mods/status-jc/watch.js`
- Create: `~/.config/herdr-app/mods/status-jc/watch.test.mjs`

**Interfaces:**
- Produces (exported from `watch.js`):
  - `searchSince(now: Date): string` — `YYYY-MM-DD` seven days before `now`.
  - `checks(rollup): { name, state: "ok" | "ko" | "running", url }[]` — copy of `mods/pr/model.js` `checks` (comment: copied because mods cannot import each other).
  - `jenkinsBuild(url): { jobPath, number } | null` — same copy.
  - `sonarFindings(checkRun: { conclusion, output: { summary } } | null): { failed: boolean, issues: number, hotspots: number } | null` — `null` when there is no Sonar check-run.
  - `markers(comments: { author: { login }, body }[], me: string): Set<"pr-risk" | "pr-demo" | "qa">`
  - `Signals = { key, repo, number, url, title, branch, head, draft, jenkins: { state, url, jobPath, number } | null, sonar: { state, failed, issues, hotspots, url } | null, pending: boolean, markers: Set, error: string | null }` and `signalsOf(view, checkRuns, me): Signals` — `view` is `gh pr view --json number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,comments` plus `repo` (`owner/name`); `checkRuns` is the `check_runs` array of `gh api repos/<repo>/commits/<sha>/check-runs`; `key` is `<repo>#<number>`; `pending` is true when any check is `running`. `sonar.state` is `"ko"` when `failed` or `issues + hotspots > 0`, else `"ok"`, `"running"` while the check-run is not completed.

- [ ] **Step 1: Write the failing tests** in `watch.test.mjs`:
  - `searchSince(new Date("2026-11-14T10:00:00Z"))` → `"2026-11-07"`.
  - `sonarFindings` on the real summaries (fixtures copied from arthur#5458 and #5449, see spec): passed with `[0 New issues]`, `[0 Security Hotspots]` → `{ failed:false, issues:0, hotspots:0 }`; a passed summary with `[3 New issues]` and `[1 Security Hotspots]` → `{ failed:false, issues:3, hotspots:1 }`; `conclusion:"failure"` with the #5449 summary → `failed:true`; an unreadable summary (`"?"`) with `conclusion:"success"` → `{ failed:false, issues:0, hotspots:0 }`; `null` → `null`.
  - `markers` with comments by `jcgay` starting `<!-- pr-risk -->` and `<!-- testing-api-pull-requests -->`, plus one by `someone` starting `<!-- pr-demo -->` → `Set {"pr-risk","qa"}`.
  - `signalsOf` on a view with a Jenkins StatusContext `FAILURE` and a Sonar CheckRun → `jenkins.state:"ko"`, `jenkins.jobPath:"team.software/github/arthur/PR-5459"`, `sonar` from the check-run named `SonarCloud Code Analysis`, `key:"softwarevidal/arthur#5459"`.
- [ ] **Step 2: Run** `node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the exports. Sonar counts: `/\[(\d+) New issues\]/` and `/\[(\d+) Security Hotspots\]/` on `output.summary`, 0 when absent.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(herdr): read Jenkins, Sonar and review markers of a PR`.

### Task 2: Decisions — triggers, budget, chaining

**Files:**
- Modify: `~/.config/herdr-app/mods/status-jc/watch.js`
- Modify: `~/.config/herdr-app/mods/status-jc/watch.test.mjs`

**Interfaces:**
- Consumes: `Signals` (Task 1).
- Produces:
  - `Entry = { url: string, title: string, head: string | null, attempts: { jenkins: number, sonar: number }, launched: { step, head, tab } | null, silent: { [head]: step[] }, label: string, error: string | null }` and `emptyEntry(): Entry`.
  - `Registry = { on: boolean, prs: { [key]: Entry }, error: string | null, at: number }`.
  - `Tab = { exists: boolean, running: boolean }` (for the PR's launched tab; `{ exists:false, running:false }` when none).
  - `decide(s: Signals, entry: Entry, tab: Tab, ctx: { on: boolean, slots: number, karadocFree: boolean, hasQa: boolean }): { entry: Entry, launch: step | null, toast: string | null }` — pure; `slots` = remaining global agent slots.
  - `tabName(number, step): string` → `⟳ #<number> <step>`.
  - `LABELS` — `ok`, `brouillon`, `en attente`, `agent en cours`, `à toi`, `pas de clone local`, `erreur`.

`decide`, in this order:
0. Copy `s.url` and `s.title` into the entry.
1. `s.error` → entry with `error`, label `erreur`, no launch.
2. Head changed (`s.head !== entry.head`): if `entry.launched` and `tab.exists`, the push is the agent's (keep attempts); otherwise mine: reset both attempts to 0. Store the new head.
3. A launched step ends when `!tab.running`; a review step that ended with no marker on the current head is added to `silent[head]`; `launched` becomes `null`. While `tab.running`: label `agent en cours`, no launch.
4. A check back to `ok` resets its attempts.
5. Pick the step: `jenkins` if Jenkins `ko`; else wait (label `en attente`) if Jenkins `running` or `s.pending`; else `sonar` if Sonar `ko`; else review, only when `!s.draft`: first of `pr-risk`, `pr-demo`, `qa` (`qa` only if `ctx.hasQa`) not in `markers` nor `silent[head]`. Sonar at budget with `failed:false` lets review go; with `failed:true` review waits. Jenkins at budget: nothing else.
6. A fix step at 2 attempts → label `à toi`, and `toast` the first time it reaches 2 (`"PR #<n> : <step> à toi"`). Draft with nothing to fix → label `brouillon`. Nothing left → `ok`.
7. Launch only if `ctx.on`, `ctx.slots > 0`, and for `pr-demo`/`qa` `ctx.karadocFree`; else label `en attente`. A launched fix step increments its attempt; `launched = { step, head, tab: tabName(...) }`.

- [ ] **Step 1: Write the failing tests**, one per rule, named: `jenkins ko launches jenkins`, `running check waits`, `sonar issues on green gate launch sonar`, `review order risk demo qa`, `qa skipped without the skill`, `draft gets no review`, `marker skips a step`, `silent step not relaunched on same head but relaunched on new head`, `agent push keeps attempts`, `my push resets attempts`, `third attempt is refused and toasts once`, `sonar at budget with green gate lets review go`, `jenkins at budget blocks everything`, `vanished tab ends the step`, `running tab blocks the PR`, `off launches nothing`, `no slot waits`, `karadoc busy holds demo and qa but not pr-risk`, `error launches nothing`.
- [ ] **Step 2: Run** `node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `emptyEntry`, `decide`, `tabName`, `LABELS`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(herdr): decide what the PR watch launches`.

### Task 3: Prompts, clone lookup and one watch round

**Files:**
- Modify: `~/.config/herdr-app/mods/status-jc/watch.js`, `watch.test.mjs` (prompts, clone choice)
- Create: `~/.config/herdr-app/mods/status-jc/watcher.js`
- Modify: `~/.config/herdr-app/mods/status-jc/main.js`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `promptFor(step, s: Signals): string` (in `watch.js`):
    - `jenkins`: says the build of `<url>` failed on `<head, 8 chars>` (`<jenkins url>`), that the folder is a detached worktree reserved for the watch, to read the log with `jk run log <jobPath> <number>` (no VPN: say so and stop), to fix, commit and push with `git push origin HEAD:refs/heads/<branch>` if the PR's code is at fault (never force, never another branch), or to rerun with `jk run rerun <jobPath> <number>` without pushing if it is infrastructure or a flaky test.
    - `sonar`: SonarCloud reports problems on `<url>` (`<sonar url>`); read the new issues and hotspots of pull request `<number>` (SonarQube MCP, `pullRequest` parameter), fix all of them, blocking or not, commit and push the same way.
    - `pr-risk`: `/pr-risk <url>`; `pr-demo`: `/pr-demo <url>`; `qa`: `/testing-api-pull-requests <url>` followed by: stop once the report is posted (step 7), no fix, no push.
  - `repoOfRemote(url: string): string | null` (in `watch.js`) — `git@github.com:softwarevidal/arthur.git` and `https://github.com/softwarevidal/arthur` → `softwarevidal/arthur`.
  - `round(registry: Registry): Promise<Registry>` (in `watcher.js`), using the herdr module. Steps:
    1. `me` from `gh api user --jq .login` (cache on the module's instance argument, not module scope).
    2. `gh search prs … --json number,repository,updatedAt` (constraint above); a failure sets `registry.error` and returns.
    3. Per PR, in parallel: `gh pr view <n> -R <repo> --json …` (Task 1 fields) and `gh api repos/<repo>/commits/<head>/check-runs` → `signalsOf`; a failing call gives `Signals` with `error`.
    4. Per repo, once per round: `clone` = the first folder among space folders, pane cwds, `~/dev/agents-worktree/<name>/*` and `/Volumes/sourcecode/<name>` whose `git remote get-url origin` maps to the repo through `repoOfRemote`, resolved to its main checkout with `git rev-parse --path-format=absolute --git-common-dir` (parent dir), or `null`; `hasQa` = `readTextFile(<clone>/.agents/skills/testing-api-pull-requests/SKILL.md)` or the `.claude/skills/…` path is non-null.
    5. Per PR, sequentially in search order: compute `Tab` from `spaces()`/`agents()` by `entry.launched.tab`; `slots = 3 −` running watch agents (`agents()` whose `tab_name` starts with `⟳ `, status `working`/`blocked`), recounted after each launch; `karadocFree` = none of those is a `pr-demo`/`qa` tab. Call `decide`. A launch with `clone === null` → label `pas de clone local`, keep the entry from before `decide` with that label (attempt not counted). Drop registry entries for PRs no longer listed.
    6. `prepareWorktree(clone, branch): Promise<{ path } | { dirty: true }>`: `git -C <clone> fetch origin <branch>`; missing path → `git -C <clone> worktree add --detach <path> origin/<branch>`; existing → dirty if `git status --porcelain` prints anything or `git rev-list HEAD --not --remotes=origin` prints anything, else `git checkout --detach origin/<branch>`. Dirty → label `à toi`, launch undone.
    7. Start the agent: a space whose `folder` is the path → `run("tab.new", { space, folder: path, name: tabName, argv: ["claude"], task: promptFor(...) })`; none → `run("space.new", { folder: path, tab: tabName, argv: ["claude"], task })`.
    8. Each `toast` → `notify({ title, body: s.url, level: "warning" })`.
  - In `main.js` `init`: `cx.timer.after(60000, …)` then `cx.timer.every(300000, …)`, each spawning `round(shared("pr-watch") ?? { on: true, prs: {}, error: null, at: 0 })` then `setShared("pr-watch", result)`; a `busy` flag skips a round while one runs. Rounds run even when `on` is false (display stays fresh; `decide` launches nothing).

- [ ] **Step 1: Write the failing tests** for `promptFor` (each step contains the URL; `jenkins` contains `jk run log team.software/github/arthur/PR-5459 1` and `git push origin HEAD:refs/heads/MERLIN-2320`, and no `--force`; `qa` contains `étape 7`) and `repoOfRemote` (both URL forms, plus a non-GitHub URL → `null`).
- [ ] **Step 2: Run** the tests — Expected: FAIL. **Step 3: Implement** `promptFor`, `repoOfRemote`. **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Implement** `watcher.js` and the timers in `main.js`. Run `herdr-app check ~/.config/herdr-app/mods/status-jc` — Expected: no error.
- [ ] **Step 6: Live check, watch off:** temporarily make the default registry `on: false` and the first round start after 5 s; save (Herdr reloads the mod), wait 30 s, then read `~/.config/herdr-app/shared.json`: `pr-watch.prs` lists my recent PRs with labels, `pr-watch.on` is false, and no `⟳` tab was opened. Restore 60 s and `on: true` (the stored registry keeps `on: false` until the panel switch of Task 4 flips it).
- [ ] **Step 7: Commit** `watch.js`, `watch.test.mjs`, `watcher.js`, `main.js` — `feat(herdr): watch my PRs and start agents from the status bar`.

### Task 4: Watch section and switch in the PR panel

**Files:**
- Modify: `~/.config/herdr-app/mods/pr/main.js`

**Interfaces:**
- Consumes: `shared("pr-watch"): Registry` (Task 2 shape), `tabName` format.

- [ ] **Step 1: Implement**, under the current PR's body, a `section("Surveillance")` with:
  - a switch row: `Surveillance active` / `Surveillance coupée`, a click does `setShared("pr-watch", { ...reg, on: !reg.on })`;
  - `reg.error` in `t.ansi1` when set;
  - one row per entry: `#<number> <repo name>` truncated, then its `label` (colors: `à toi`/`erreur` `t.blocked`, `agent en cours` `t.working`, `ok` `t.done`, others `t.dim`), and `error` under it when set. Click: with a launched tab still listed in `agents()` → `run("agent.focus", { terminal })` of that agent's pane terminal (from `panes()`); otherwise `exec("open", [entry.url])`.
- [ ] **Step 2: Run** `herdr-app check ~/.config/herdr-app/mods/pr` and `node --test ~/.config/herdr-app/mods/*/*.test.mjs` — Expected: pass.
- [ ] **Step 3: Live check**: open the panel, the section lists the PRs seen in Task 3; clicking the switch flips the label and `shared.json` `pr-watch.on`.
- [ ] **Step 4: Commit** — `feat(herdr): show the PR watch in the PR panel`.

### Task 5: Sign the QA report in arthur

**Files:**
- Modify: `/Volumes/sourcecode/arthur/.agents/skills/testing-api-pull-requests/references/report.md`

- [ ] **Step 1:** In a new arthur worktree on a branch from `origin/master` (`wt switch --create sign-qa-report --base origin/master`; never on `MERLIN-2321`), state in the "Comment" section that the report's first line is `<!-- testing-api-pull-requests -->`, so tools can find the report, and add that line at the top of the report template if the file has one.
- [ ] **Step 2: Verify** `rg -n 'testing-api-pull-requests -->' .agents/skills/testing-api-pull-requests` prints the new lines.
- [ ] **Step 3: Commit** (arthur rules: no JIRA prefix for a doc change, body with `tag: doc`) — `Sign the QA report so tools can find it`. Do not push.

### Task 6: Design doc follow-up

**Files:**
- Modify: `~/.config/herdr-app/docs/2026-11-14-pr-watch-design.md`

- [ ] **Step 1:** Replace the shared-module and JSON-file wording: the code lives in `mods/status-jc/` (`watch.js`, `watcher.js`) because Herdr refuses cross-mod imports, and the registry is `shared("pr-watch")`.
- [ ] **Step 2: Commit** — `docs(herdr): keep the PR watch in status-jc and shared state`.
