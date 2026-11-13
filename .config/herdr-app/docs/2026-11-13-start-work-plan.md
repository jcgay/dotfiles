# start-work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Herdr mod that turns "start a ticket" (Jira key or GitHub issue) into one pick: assign + In Progress, worktree, space with Claude, brainstorming prompt typed but not sent.

**Architecture:** `lib.js` holds every decision that needs no Herdr (parsing CLI output, JQL, branch names, transition choice, existing work, prompt) and is tested with `node:test`. `work.js` runs the side effects (jira, curl, wt, git, gh, Herdr commands, clipboard) in order. `main.js` is the dialog.

**Tech Stack:** Herdr 0.1.15 mod (gpui-kit JS, `herdr` module), jira-cli 1.7, Jira REST v3 via curl, worktrunk (`wt`), `gh`, macOS `pbcopy`/`pbpaste`/`osascript`.

**Spec:** `~/.config/herdr-app/docs/2026-11-13-start-work-design.md` (read it first; this plan does not repeat its reasons).

## Global Constraints

- Mod folder: `~/.config/herdr-app/mods/start-work/`; `mod.json` is `{ "place": "none" }`. No `cloned_from`.
- No `setTimeout`/`setInterval`: `cx.timer`. Every program runs through `exec(cmd, args, { cwd, timeout })`. Herdr types: `~/.config/herdr-app/herdr.d.ts`, `gpui-kit.d.ts`; rules: `~/.config/herdr-app/AGENTS.md` ("Mods", "UI", "The herdr module").
- `lib.js` imports nothing from `herdr`, `gpui-kit` or `gpui-base` (the CI loads it with plain Node 24).
- Local spaces only: a focused space with a non-null `machine` gets a message, no actions.
- Jira: server `https://vidalgroup.atlassian.net`, user `jean-christophe.gay@vidal.fr`, token in env `JIRA_API_TOKEN`. jira-cli JQL must always carry its own `project in (…)` clause (without one, jira-cli adds its default project).
- Worktrees through `wt switch` only (never `git worktree add`), run from the repo's main checkout, with `--no-cd`.
- The prompt is never submitted (no `hc send`, no Enter key).
- UI copy in French, as in the spec. Commits in the dotfiles repo with `yadm`, Conventional Commits (`feat(herdr): …`), body explaining why, last line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit the mod's `gpui-kit.d.ts` or `jsconfig.json`.
- After every change to the mod: `herdr-app check ~/.config/herdr-app/mods/start-work` must pass, and `node --test ~/.config/herdr-app/mods/*/*.test.mjs` must pass.

## Review Focus

1. Search text with `"`, `\` or JQL words (`AND`, `~`) must not break the JQL or inject clauses: quoted and escaped (test in Task 1).
2. Claude in a new worktree may stop on its folder-trust dialog (status `blocked`, never `idle`): the paste must time out into the toast fallback, not wait forever nor paste into the dialog (Task 4: only paste on `idle`).
3. A repo with no GitHub remote, `gh` not logged in, or Jira unreachable (no VPN): the other source still lists, the failing one shows one line of error (Task 3).
4. worktrunk hooks can take minutes: `wt` runs with a 10-minute timeout and the dialog shows it is working; a second `↵` does nothing meanwhile (Task 4).
5. The branch already checked out in a worktree with uncommitted changes: Reprendre opens it as is, never resets or switches it (Task 4, existing worktree path).

---

### Task 1: Pure helpers for search and naming

**Files:**
- Create: `~/.config/herdr-app/mods/start-work/lib.js`
- Create: `~/.config/herdr-app/mods/start-work/lib.test.mjs`
- Create: `~/.config/herdr-app/mods/start-work/mod.json` (`{ "place": "none" }`)

**Interfaces:**
- Produces (all exported from `lib.js`):
  - `Item = { kind: "jira", key, title, status, category, assignee } | { kind: "issue", number, title, url, assignees } | { kind: "free", title }` (`category` is Jira's `statusCategory.key`: `new` | `indeterminate` | `done`; `assignee` an email or null).
  - `slug(text: string): string`
  - `branchFor(item: Item): string`
  - `parseQuery(text: string): { kind: "empty" } | { kind: "key", key } | { kind: "issue", number } | { kind: "text", text }`
  - `jiraProjects(subjects: string[], min = 3): string[]`
  - `jql({ projects: string[], text?: string, mine?: boolean }): string`
  - `parseJiraIssues(raw: string): Item[]` (input: `jira issue list --raw` or `jira issue view --raw`, an array or one object)
  - `parseGhIssues(json: string): Item[]` (input: `gh issue list|view --json number,title,url,assignees`, array or object)
  - `promptFor(item: Item): string`

- [ ] **Step 1: Write the failing tests** in `lib.test.mjs` (`node:test`, `assert/strict`):
  - `slug("Données : 🐛 Fix l'accès")` → `"donnees-fix-l-acces"`; a 80-char title gives ≤ 50 chars, cut at a dash, no trailing dash.
  - `branchFor({kind:"jira", key:"MERLIN-2330", title:"Inflexions des noms composés"})` → `"MERLIN-2330-inflexions-des-noms-composes"`; issue 5355 "Inflections dans la recherche" → `"5355-inflections-dans-la-recherche"`; free "Ma super idée" → `"ma-super-idee"`.
  - `parseQuery("")`/`"  "` → empty; `"merlin-2321"` → `{kind:"key", key:"MERLIN-2321"}`; `"#5355"` → `{kind:"issue", number:5355}`; `"inflexions"` → text.
  - `jiraProjects(["MERLIN-1: a","MERLIN-2: b","MERLIN-3: c","APIREST-9: d","Fix x","ZAPI-1: y"])` → `["MERLIN"]`; with `min=1` → `["MERLIN","APIREST","ZAPI"]` (most frequent first).
  - `jql({projects:["MERLIN","APIREST"], mine:true})` → `project in ("MERLIN", "APIREST") AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`; `jql({projects:["MERLIN"], text:'say "hi" \\ AND x'})` contains `text ~ "say \"hi\" \\\\ AND x"` and exactly one `project in`.
  - `parseJiraIssues` on a fixture string shaped like the real output (`[{"key":"MERLIN-2321","fields":{"summary":"…","status":{"name":"Ouvert","statusCategory":{"key":"new"}},"assignee":null}}]`) and on a single object → items with `status:"Ouvert", category:"new", assignee:null`; `assignee` is `fields.assignee.emailAddress` when present.
  - `parseGhIssues` on `[{"number":5446,"title":"t","url":"u","assignees":[{"login":"jcgay"}]}]` → `[{kind:"issue", number:5446, title:"t", url:"u", assignees:["jcgay"]}]`.
  - `promptFor` → Jira `/superpowers:brainstorming MERLIN-2321 : <title>`, issue `/superpowers:brainstorming <url> : <title>`, free `/superpowers:brainstorming <title>`.
- [ ] **Step 2: Run** `node --test ~/.config/herdr-app/mods/start-work/lib.test.mjs` — Expected: FAIL (module/exports missing).
- [ ] **Step 3: Implement** the exports in `lib.js`. `slug` and `branchFor` may be adapted from aguiddir/herdr-config `mods/start-work/lib.js` (credit it in a comment). JQL string escaping: `\` → `\\`, `"` → `\"`; project keys quoted. Key regex: `^[A-Z][A-Z0-9]+-\d+$` on the trimmed, upper-cased text.
- [ ] **Step 4: Run** the same command — Expected: all PASS.
- [ ] **Step 5: Commit** `lib.js`, `lib.test.mjs`, `mod.json` — `feat(herdr): parse tickets and name branches for start-work`.

### Task 2: Pure helpers for decisions

**Files:**
- Modify: `~/.config/herdr-app/mods/start-work/lib.js`
- Modify: `~/.config/herdr-app/mods/start-work/lib.test.mjs`

**Interfaces:**
- Consumes: `Item`, `slug` (Task 1).
- Produces:
  - `pickStartTransition(transitions: { id, name, to: { name, statusCategory: { key } } }[]): { id, name } | null`
  - `existingWork(item: Item, branches: string[], prs: { number, title, headRefName }[], delivered: Set<string>): { branch, pr } | null` — `branches` newest first, local and `origin/`-stripped; `prs` are OPEN PRs; `delivered` = branches merged into the base or carrying a merged PR.
  - `baseChoices(defaultBranch: string, remoteBranches: string[]): string[]` — `remoteBranches` as `git for-each-ref --sort=-committerdate --format=%(refname:short) refs/remotes/origin` prints them.
  - `spaceIn(path, checkouts, panes, spaces)` — as in the colleague's `lib.js` (copy with credit).

- [ ] **Step 1: Write the failing tests:**
  - `pickStartTransition` on the MERLIN list from the spec (Selected for Development→new, Attente Validation→En Validation PO/indeterminate, In Progress→En cours/indeterminate, Bloqué→Bloqué/indeterminate, …) → `{ name: "In Progress" }`; a list whose only indeterminate is "Bloqué" → `null`; a transition named "Démarrer" to "En Cours" (accent/case variant) → picked.
  - `existingWork`: open PR titled "MERLIN-2321: Accept pack" on branch `x` → `{branch:"x", pr}`; no PR, branches `["backup/MERLIN-2321","MERLIN-2321-old","MERLIN-2321"]` with `delivered = {"MERLIN-2321-old"}` → `MERLIN-2321`; all such branches delivered → `null`; `MERLIN-23210` does not match `MERLIN-2321`; issue 5355 matches `5355-inflections`, not `15355-x`; free item → `null`.
  - `baseChoices("master", ["origin/HEAD","origin/master","origin/sprint-la-search","origin/sprint-old","origin/feature"])` → `["master","sprint-la-search","sprint-old"]`.
  - `spaceIn`: the three cases of the colleague's tests (terminal inside, nested `.claude/worktrees` checkout excluded, space by folder only).
- [ ] **Step 2: Run** `node --test …/start-work/lib.test.mjs` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** Transition match: `to.statusCategory.key === "indeterminate"` and `/en cours|in progress/` on the accent-stripped, lower-cased transition name or `to.name`. `existingWork`: as the colleague's, but a branch in `delivered` never counts and only open PRs are given.
- [ ] **Step 4: Run** — Expected: all PASS.
- [ ] **Step 5: Commit** — `feat(herdr): decide transitions and existing work for start-work`.

### Task 3: The dialog: search, base, branch

**Files:**
- Create: `~/.config/herdr-app/mods/start-work/main.js`
- Modify: `~/.config/herdr-app/keys.json` (global `"cmd-shift-j": "mod.open:start-work"`)

**Interfaces:**
- Consumes: Task 1 and 2 exports.
- Produces: the dialog calls `start(state, cx)` from Task 4 with `state = { repo: { main, name }, item: Item, base: string, branch: string, take: boolean, resume: { branch, pr } | null }`.

- [ ] **Step 1: Repo and context on open.** From `focused()` and `spaces()`: refuse a remote space ("Disponible seulement sur cette machine") and a folder outside git ("Pas un dépôt git"). Repo main checkout: `git rev-parse --path-format=absolute --git-common-dir` minus `/.git`; name: its basename. In parallel: `git fetch --quiet origin`; branches (`git for-each-ref --sort=-committerdate --format=%(refname:short) refs/heads refs/remotes/origin`); default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, strip `origin/`); subjects (`git log --since=12.months --format=%s`); open PRs (`gh pr list --state open --limit 100 --json number,title,headRefName`); delivered = `git branch -a --merged origin/<default>` names plus `gh pr list --state merged --limit 200 --json headRefName`. Projects: `config.json` `jira[<repo name>]` if present, else `jiraProjects(subjects)`.
- [ ] **Step 2: Search.** Input (`InputState` + `Input` from `gpui-base`, as `mods/changes/main.js` does). On change, after a 300 ms pause (`cx.timer`), run by `parseQuery`: empty → `jira issue list -p "" -q <jql mine> --raw --paginate 0:20` and `gh issue list --assignee @me --state open --limit 20 --json …`; key → `jira issue view <key> --raw`; `#n` → `gh issue view <n> --json …`; text → `jql({projects,text})` and `gh issue list --state open --search <text> --limit 20 --json …`. Drop answers older than the latest query. Each source failing shows one line ("Jira : <erreur>", "GitHub : <erreur>") and leaves the other. Rows: Jira first, then GitHub, then "Sans ticket : <texte>" for a text query.
- [ ] **Step 3: Base, branch, checkbox, button.** Base menu from `baseChoices`, default first. Branch input filled by `existingWork(...)?.branch ?? branchFor(item)` when the selected row changes; a hand-typed value stays until the row changes. Button reads **Reprendre** when the branch field equals the `existingWork` branch, else **Créer**. Checkbox "M'assigner et passer En cours", checked, shown for Jira rows only. Keys: `↑↓` row, `↵` go, `esc` close (`closeOverlay(props().overlay)`), `tab` search ↔ branch.
- [ ] **Step 4: Bind and check.** Add the key; `herdr-app check ~/.config/herdr-app/mods/start-work` — Expected: `check passed`. Then in the app, from a terminal in arthur: `cmd-shift-j`, empty field lists assigned MERLIN/APIREST tickets and assigned issues; typing `URI` lists MERLIN-2321; `#5446` shows that issue; `herdr-app shot` to look at it. `↵` may call a stub `start` that only `notify`s the state for now.
- [ ] **Step 5: Commit** `main.js` and `keys.json` — `feat(herdr): add the start-work dialog`.

### Task 4: Start or resume the work

**Files:**
- Create: `~/.config/herdr-app/mods/start-work/work.js`
- Modify: `~/.config/herdr-app/mods/start-work/main.js` (call the real `start`, busy state)

**Interfaces:**
- Consumes: `state` from Task 3; `pickStartTransition`, `promptFor`, `spaceIn` from Tasks 1–2.
- Produces: `export async function start(state, cx): Promise<string[]>` — returns the notes to show (empty when all went well); throws an `Error` whose message says what is already done when a step must stop the run.

- [ ] **Step 1: Validate and take the ticket.** `git check-ref-format --branch <branch>` fails → throw "« <branch> » n'est pas un nom de branche valide." before anything. For a Jira item, `state.take`, and not resuming: if `assignee` is not `jean-christophe.gay@vidal.fr`, `jira issue assign <key> jean-christophe.gay@vidal.fr` (failure → throw, nothing made). If `category === "new"`: `curl -sf -u "$user:$JIRA_API_TOKEN" https://vidalgroup.atlassian.net/rest/api/3/issue/<key>/transitions` (through `sh -c` so the token stays in the environment), `pickStartTransition`, then `jira issue move <key> "<name>"`. No transition, or a failure of either call → push the note "<key> assigné, état inchangé : <raison>" and go on.
- [ ] **Step 2: Worktree.** Branch already in `git worktree list --porcelain` → use that folder untouched. Else, resuming → `wt switch <branch> --no-cd`; creating → `wt switch --create <branch> --base <base> --no-cd`; `cwd` = repo main, `timeout: 600000`; failure → throw with wt's last stderr line, prefixed by what Jira already did. Folder = the porcelain entry for the branch afterwards.
- [ ] **Step 3: Space.** `spaceIn(folder, checkouts, panes(), spaces())` found → `space.select` (+ `tab.select`), return (no prompt). Else `run("space.new", { folder, argv: ["claude"] })`.
- [ ] **Step 4: Prompt (creating only).** Find the new terminal: `terminals()` entry with `cwd` under `folder` and a `herdr.space` label, polled with `cx.timer` every 500 ms. Wait until its `status` is `idle`, at most 30 s. Then, only if the active space (`spaces().find(s => s.active)`) is still the new one and `osascript -e 'clipboard info'` lists only text classes (`«class utf8»`, `string`, `Unicode text`…): save `pbpaste`, `pbcopy` the `promptFor(item)` (via `exec("sh", ["-c", "printf %s \"$1\" | pbcopy", "sh", prompt])`), `run("pane.focus", { terminal })`, `run("terminal.paste")`, then restore the saved text with `pbcopy`. Any other path → `notify({ title: "Prompt à coller dans Claude", body: prompt, timeout: 0 })`.
- [ ] **Step 5: Wire and verify.** `main.js`: `↵` sets busy (button "Création…", ignores a second `↵`), awaits `start`, closes on success, shows notes with `notify`, shows a thrown message in the dialog. `herdr-app check` passes. Manual run in arthur on a test ticket the user names (ask; do not pick one): new branch from `master` → Jira assigned and En cours, worktree in `~/dev/agents-worktree/arthur/<branch>`, space with Claude, prompt typed, not sent, clipboard restored. Then `cmd-shift-j` on the same ticket shows **Reprendre** and only selects the space. Remove the test worktree with the user's go-ahead (`wt remove`).
- [ ] **Step 6: Commit** `work.js`, `main.js` — `feat(herdr): start or resume a ticket from start-work`.

### Task 5: Document

**Files:**
- Modify: `~/CLAUDE.md` (section "Herdr desktop app": add `start-work` to the list of our mods, one line on `cmd-shift-j` and `mods/start-work/config.json`)

- [ ] **Step 1:** Edit the section; `node --test ~/.config/herdr-app/mods/*/*.test.mjs` still passes.
- [ ] **Step 2: Commit** — `docs: mention start-work in CLAUDE.md`.
