# Projects picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `projects` popup mod that lists the git repos at the root of `~/dev`, recent first, filters as you type and opens (or goes to) a space on the chosen one.

**Architecture:** Pure logic in `mods/projects/lib.js` (parsing, ordering, filtering, matching open spaces), tested with `node:test`. `main.js` is the dialog view (input, arrow keys, Enter, Escape), modelled on `mods/start-work/main.js`. `spaces-jc` only gains a header button.

**Tech Stack:** Herdr mod (gpui-kit / gpui-base, `herdr` module), `node:test`.

**Spec:** `~/.config/herdr-app/docs/2026-11-23-projects-picker-design.md`

## Global Constraints

- Repos: direct children of `~/dev` whose `.git` is a **directory**. Worktrees (`.git` file), `agents-worktree`, non-git folders are out.
- Order: recently opened first (newest first), then the rest by last commit date (newest first).
- Filter: case-insensitive substring on the folder name, prefix matches first. No fuzzy search.
- Open: an existing space with a terminal in the repo → `space.select {id}`; otherwise `space.new {folder}`.
- Recency lives in the mod's `localStorage` as `{ "<repo name>": <ms> }`.
- Key: `cmd-shift-o` → `mod.open:projects` in `keys.json` (`global` section).
- Local machine only: spaces with a `machine` are ignored.
- User-facing text in French, like `start-work`.
- Commits: Conventional Commits `feat(herdr): …`, on a branch (not `master`), README updates in the same commit.

## Review Focus

1. `~/dev` is a symlink to `/Volumes/sourcecode`: pane `cwd`s and Herdr's `recent` folders use the resolved path (`view.json` shows `/Volumes/sourcecode/arthur`). Both roots must match the same repo. → Task 1 `repoOfFolder` test with both roots.
2. A space in a subfolder of a repo (`~/dev/arthur/core`) still counts as that repo. → Task 1 test.
3. A name that is a prefix of another (`arthur` vs `arthur-prisca`): `/Volumes/sourcecode/arthur-prisca` must not match `arthur`. → Task 1 test.
4. Empty query shows the full ordered list; a query matching nothing shows an empty-state line, and Enter does nothing. → Task 1 `filter` test, Task 2 behaviour.
5. Unreadable or missing `view.json` / `localStorage` (first run) must not break the list. → Task 1 `parseRecent` test on `""` and invalid JSON.

---

### Task 1: Pure logic (`lib.js`)

**Files:**
- Create: `~/.config/herdr-app/mods/projects/lib.js`
- Test: `~/.config/herdr-app/mods/projects/lib.test.mjs`

**Interfaces:**
- Produces (all named exports, no `herdr` import):
  - `parseRepos(stdout: string): string[]` — input is the output of `find <root>/ -mindepth 2 -maxdepth 2 -name .git -type d` (one `<root>/<name>/.git` per line); returns the `<name>`s, sorted, `agents-worktree` excluded.
  - `parseCommits(stdout: string): Record<string, number>` — lines `"<name> <unix seconds>"`; returns ms. Lines with no timestamp are skipped.
  - `parseRecent(json: string): string[]` — the `recent[].folder` of `view.json`; `[]` on empty or invalid JSON.
  - `repoOfFolder(folder: string, roots: string[], names: Set<string>): string | null` — the repo name when `folder` is `<root>/<name>` or below it, for any root.
  - `stamp(recent: Record<string, number>, names: string[], now: number): Record<string, number>` — copy with each name set to `now`.
  - `order(names: string[], recent: Record<string, number>, commits: Record<string, number>): string[]`
  - `filter(names: string[], query: string): string[]`
  - `openSpaceFor(name: string, roots: string[], panes: {tab: string, cwd?: string}[], spaces: {id: string, machine?: string|null, tabs: {id: string}[]}[]): string | null` — id of the first local space with a pane in that repo.

- [ ] **Step 1: Write the failing tests** in `lib.test.mjs` (`node:test`, `node:assert/strict`), one `test()` each:
  - `parseRepos`: `"/Users/jc/dev/b/.git\n/Users/jc/dev/a/.git\n/Users/jc/dev/agents-worktree/.git\n"` → `["a", "b"]`.
  - `parseCommits`: `"arthur 1700000000\nempty \n"` → `{ arthur: 1700000000000 }`.
  - `parseRecent`: `'{"recent":[{"name":"","folder":"/Volumes/sourcecode/arthur"}]}'` → `["/Volumes/sourcecode/arthur"]`; `""` → `[]`; `"{"` → `[]`.
  - `repoOfFolder` with `roots = ["/Users/jc/dev", "/Volumes/sourcecode"]`, `names = new Set(["arthur", "arthur-prisca"])`:
    `"/Volumes/sourcecode/arthur"` → `"arthur"`; `"/Users/jc/dev/arthur/core"` → `"arthur"`; `"/Volumes/sourcecode/arthur-prisca"` → `"arthur-prisca"`; `"/Volumes/sourcecode/other"` → `null`; `"/Users/jc"` → `null`.
  - `order(["a","b","c","d"], { c: 2, a: 1 }, { b: 5, d: 9 })` → `["c","a","d","b"]`; a name in neither map goes last, by name.
  - `filter(["xarthur","arthur","blaise"], "ART")` → `["arthur","xarthur"]` (prefix first, order otherwise kept); `filter(l, "")` → `l`; `filter(l, "zzz")` → `[]`.
  - `stamp({ a: 1 }, ["b"], 7)` → `{ a: 1, b: 7 }` and the input is unchanged.
  - `openSpaceFor("arthur", roots, [{ tab: "t2", cwd: "/Volumes/sourcecode/arthur/core" }], [{ id: "s1", tabs: [{ id: "t1" }] }, { id: "s2", tabs: [{ id: "t2" }] }])` → `"s2"`; same with `machine: "vps"` on `s2` → `null`.

- [ ] **Step 2: Run them, expect failure**
  Run: `node --test ~/.config/herdr-app/mods/projects/lib.test.mjs`
  Expected: FAIL, cannot find `./lib.js`.

- [ ] **Step 3: Implement the exports in `lib.js`** to the signatures above. `repoOfFolder` takes the first path segment after the root (`folder === root + "/" + name` or starts with `root + "/" + name + "/"`) and checks it against `names`.

- [ ] **Step 4: Run them, expect success**
  Run: `node --test ~/.config/herdr-app/mods/projects/lib.test.mjs`
  Expected: all pass.

- [ ] **Step 5: Commit** `lib.js` and `lib.test.mjs` (`yadm add …; yadm commit`), e.g. `feat(herdr): list and order the projects of ~/dev`.

### Task 2: The `projects` dialog

**Files:**
- Create: `~/.config/herdr-app/mods/projects/main.js`, `mod.json`, `README.md`
- Modify: `~/.config/herdr-app/keys.json` (`global`: `"cmd-shift-o": "mod.open:projects"`)
- Modify: `~/.config/herdr-app/README.md` (keys table and the mods list)

**Interfaces:**
- Consumes: every export of Task 1.
- Produces: the mod name `projects` (Task 3 runs `mod.open {name: "projects"}`).

- [ ] **Step 1: `mod.json` first** (before the folder has a `main.js`, or Herdr docks it into `jc.json`):
  `{ "place": "none", "title": "Ouvrir un projet", "overlay": { "kind": "dialog", "modal": true, "width": 520, "height": 420 } }`

- [ ] **Step 2: Write `main.js`**, a `View` modelled on `start-work/main.js` (`InputState` with placeholder `"Projet de ~/dev"`, `on("change")` refilters and resets the selection to 0, `on("submit")` opens; `track_focus` + `on_key_down` for up/down with `ScrollHandle.scroll_to_item`, Escape closes with `closeOverlay(props().overlay)`; focus the input via `cx.timer.after(100, …)`). In `init`, under `if (checking()) return;` for the slow part, `cx.spawn` the load:
  1. `root = home() + "/dev"`; `real` = `realpath` of it via `exec`; `roots = [root, real]`.
  2. `exec("find", [root + "/", "-mindepth", "2", "-maxdepth", "2", "-name", ".git", "-type", "d"])` → `parseRepos`.
  3. Recency: `localStorage.getItem("recent")` (JSON, `{}` when absent or invalid, in try/catch); stamp the repos of open local spaces (`repoOfFolder` over `panes()` cwds) and of `parseRecent(readTextFile(appHome() + "/view.json"))`; save back. Show `order(names, recent, {})` and `cx.notify()`.
  4. Commit dates: one `exec("sh", ["-c", 'for d in "$1"/*/.git; do n=${d%/.git}; printf "%s %s\\n" "${n##*/}" "$(git -C "$n" log -1 --format=%ct 2>/dev/null)"; done', "sh", root], { timeout: 30000 })` → `parseCommits`, reorder, `cx.notify()`.
  Rows: the name, and on the right `"ouvert"` in `t.accent` when `openSpaceFor` finds a space, else nothing. Selected row `bg(t.selected)`, click opens it. Empty list after filtering: one muted line `"Aucun projet"`. Opening: stamp the name in `localStorage`, `closeOverlay`, then `run("space.select", { id })` or `run("space.new", { folder: root + "/" + name })`.

- [ ] **Step 3: Check the mod**
  Run: `herdr-app check ~/.config/herdr-app/mods/projects && herdr-app status`
  Expected: `check passed`, no `projects` error; `yadm diff ~/.config/herdr-app/layouts/` empty (no block added to `jc.json`).

- [ ] **Step 4: Add the key and try it in the app**: `cmd-shift-o` in `keys.json`, then `cat ~/.config/herdr-app/keys.error 2>/dev/null` prints nothing. In Herdr: `⌘⇧O` opens the dialog; typing `arth` filters; Enter on a repo with no space creates one named after it; reopening lists it first; Enter on a repo already open goes to its space without a second one. `herdr-app shot` to check the look.

- [ ] **Step 5: READMEs**: `mods/projects/README.md` (what it does, the key, the order, the recency in `localStorage`, link to the design); in `~/.config/herdr-app/README.md` add `⌘⇧O` to the keys and `projects` to our mods.

- [ ] **Step 6: Commit** `mods/projects/{main.js,mod.json,README.md}`, `keys.json`, `README.md` (never `gpui-kit.d.ts` nor `jsconfig.json`), e.g. `feat(herdr): open a project of ~/dev in a space with cmd-shift-o`.

### Task 3: Button in `spaces-jc`

**Files:**
- Modify: `~/.config/herdr-app/mods/spaces-jc/main.js:592-593` (header, next to `space-new`)
- Modify: `~/.config/herdr-app/mods/spaces-jc/README.md`, `~/.config/herdr-app/README.md` (sidebar line)

**Interfaces:**
- Consumes: the mod name `projects`.

- [ ] **Step 1: Add the button** before `space-new`, same look (26 px, `rounded(6)`, hover), id `"space-open-project"`, icon `svg("mods/workspace-chrome/search.svg").size(14)`, tooltip `"Ouvrir un projet (⌘⇧O)"`, `on_click(() => run("mod.open", { name: "projects" }))`. Wrap both buttons in an `h_flex().gap(2)` so `justify_between` keeps them on the right; in rail mode (`collapsed`) show only `space-new`, as today.

- [ ] **Step 2: Check**
  Run: `herdr-app check ~/.config/herdr-app/mods/spaces-jc`
  Expected: `check passed`. In the app the magnifier sits left of `+` and opens the dialog.

- [ ] **Step 3: READMEs**: mention the button in `spaces-jc/README.md` and in the sidebar line of `~/.config/herdr-app/README.md`.

- [ ] **Step 4: Run every mod test**
  Run: `node --test ~/.config/herdr-app/mods/*/*.test.mjs`
  Expected: all pass.

- [ ] **Step 5: Commit**, e.g. `feat(herdr): open the projects dialog from the Spaces header`.
