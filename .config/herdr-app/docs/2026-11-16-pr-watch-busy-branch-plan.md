# PR watch busy branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch no watch agent on a PR whose branch is checked out somewhere in its clone with changes or commits `origin` lacks.

**Architecture:** `prepareWorktree` (watcher.js) already fetches the branch before a launch. Right after that fetch, it lists the clone's checkouts. A pure parser in `watch.js` picks the ones on the PR branch, and two git calls per checkout test whether there is unpushed work. If one has some, the function returns `{ busy: <folder> }` before creating or touching the `-watch` worktree. The round then calls `undoLaunch` with "à toi", as it already does for a dirty `-watch`.

**Tech Stack:** Herdr mods (JS, `herdr` module), git, `node:test`.

**Spec:** `~/.config/herdr-app/docs/2026-11-16-pr-watch-busy-branch-design.md` (read it first).

## Global Constraints

- Edit only `mods/status-jc/`, plus the Herdr `README.md` and the pr-watch design doc of the 14th. Never commit `gpui-kit.d.ts` or `jsconfig.json`: add files by name.
- `watch.js` imports nothing from `herdr`.
- Why copy, exactly: `` `tu travailles sur ${branch} dans ${basename(folder)} (non poussé)` ``. Label `LABELS.yours`, no toast, nothing counted (`undoLaunch`).
- Unpushed: `git status --porcelain` is non-empty, or `git rev-list HEAD --not --remotes=origin` is non-empty, run in that folder.
- A checkout marked `prunable`, or one where either git call fails, does not block.
- Tests: `node --test ~/.config/herdr-app/mods/*/*.test.mjs`; `herdr-app check ~/.config/herdr-app/mods/status-jc`.
- Commits in yadm (`rtk proxy yadm …` from `~`) on `master`, Conventional Commits.

## Review Focus

- The `-watch` worktree is detached, so it is never one of the checkouts. A future attached `-watch` would block every PR forever.
- The user's checkout is behind origin (the agent pushed, the user hasn't pulled): it is not unpushed, so it does not block.
- A blocked PR does not create the `-watch` worktree: the check runs before `worktree add`.
- Git fails in a listed folder (on an unmounted `/Volumes`): ignored, the launch goes on.
- The why line names the folder's basename, not its full path.

---

### Task 1: Hold the launch while a checkout of the branch has unpushed work

**Files:**
- Modify: `mods/status-jc/watch.js` (new `checkoutsOf`)
- Modify: `mods/status-jc/watcher.js` (`prepareWorktree`, the launch branch of `roundUnderLease`)
- Test: `mods/status-jc/watch.test.mjs`
- Docs: `README.md` (Surveillance paragraph), `docs/2026-11-14-pr-watch-design.md` (one line pointing to this design)

**Interfaces:**
- Produces: `export function checkoutsOf(porcelain: string, branch: string): string[]`, the `worktree` paths whose block has `branch refs/heads/<branch>` and no `prunable` line. `prepareWorktree(clone, repo, branch)` now returns `{ path } | { dirty: true } | { busy: string }`.

- [ ] **Step 1: Write the failing test** in `watch.test.mjs` (add `checkoutsOf` to the import):

```js
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
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs`
Expected: FAIL (`checkoutsOf` is not exported).

- [ ] **Step 3: Implement**
  - `checkoutsOf` in `watch.js`: split the output on blank lines and match the lines exactly.
  - `prepareWorktree`: right after the `fetch`, `checkoutsOf(await sh("git", ["-C", clone, "worktree", "list", "--porcelain"]), branch)`. For each folder, run the two git calls of Global Constraints. The first folder with output returns `{ busy: folder }`. A call that throws (`sh` throws on non-zero) skips that folder.
  - Round launch branch: `if (wt.busy) entry = undoLaunch(entry, r.launch, LABELS.yours, null, <why copy>)`, placed before the `wt.dirty` test. Use `basename` from `node:path` if Herdr's runtime has it (check AGENTS.md), else `folder.split("/").pop()`.
  - README: one sentence in the Surveillance paragraph. Design doc of the 14th: one line under the title pointing to `2026-11-16-pr-watch-busy-branch-design.md`.

- [ ] **Step 4: Run all tests and the mod check, expect PASS**

Run: `node --test ~/.config/herdr-app/mods/*/*.test.mjs && herdr-app check ~/.config/herdr-app/mods/status-jc`
Expected: all pass, `check passed`.

- [ ] **Step 5: Check the git calls on the real clone**

Run: `git -C /Volumes/sourcecode/vidal-data-aggregator-intl status --porcelain; git -C /Volumes/sourcecode/vidal-data-aggregator-intl rev-list HEAD --not --remotes=origin | wc -l`
Expected: output that matches what the user knows of that checkout (pushed or not). Nothing is changed.

- [ ] **Step 6: Commit** `feat(herdr): hold watch agents off a branch with unpushed work` (watch.js, watch.test.mjs, watcher.js, README.md, the design doc of the 14th), adding each file by name.
