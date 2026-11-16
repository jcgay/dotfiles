# PR watch pause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pause one PR in the PR watch: no agent and no "à toi" toast for it, while the other PRs go on.

**Architecture:** The registry `shared("pr-watch")` gets `paused: string[]` (keys `owner/repo#N`) next to `on`. Only the PR panel writes it. A round reads it into `ctx.paused` for `decide()`. At the end of a round, `status-jc/main.js` re-reads `paused` the way it already re-reads `on`, so a click during a round survives, and prunes closed PRs through a pure `keepPaused()`.

**Tech Stack:** Herdr mods (gpui-kit JS, `herdr` module), `node:test`.

**Spec:** `~/.config/herdr-app/docs/2026-11-16-pr-watch-pause-design.md` (read it first).

## Global Constraints

- Edit only `mods/status-jc/` and `mods/pr/`, plus `README.md` and the two pr-watch docs. Never `gpui-kit.d.ts` or `jsconfig.json`.
- `watch.js` imports nothing from `herdr` (plain Node loads it for tests).
- Label copy: `"en pause"`. Panel tooltips: `"Mettre en pause"` / `"Reprendre"`. Glyphs: `⏸` (running) / `▶` (paused).
- An agent already launched finishes: pause never closes a tab.
- Tests: `node --test ~/.config/herdr-app/mods/*/*.test.mjs`; mods: `herdr-app check ~/.config/herdr-app/mods/<name>`.
- Commits: Conventional Commits, `feat(herdr): …`, in yadm (`rtk proxy yadm …` from `~`), on `master`.

## Review Focus

- Pausing a PR whose agent is running: the label stays "agent en cours" and the agent's tab is not closed; the next round after it ends shows "en pause".
- A click on ⏸ during a round: the round's write must not drop it (re-read `paused` at the end of the round).
- A round that fails as a whole (`registry.error` set): `paused` is kept unchanged, not emptied.
- A paused PR on a failed Jenkins build past its budget: no toast, and `told` is not set, so resuming still toasts once.
- A click on ⏸ must not also trigger the row's click (open the PR or the agent).

---

### Task 1: Pause in the watch logic and the round

**Files:**
- Modify: `mods/status-jc/watch.js` (`LABELS`, `decide`, new `keepPaused`)
- Modify: `mods/status-jc/watcher.js:170` (`ctx`)
- Modify: `mods/status-jc/main.js:8,36` (`FRESH`, end-of-round merge)
- Test: `mods/status-jc/watch.test.mjs`

**Interfaces:**
- Produces: `LABELS.paused === "en pause"`; `ctx.paused: boolean` read by `decide(s, entry, tab, ctx)`; `export function keepPaused(paused: string[] | undefined, registry: { prs: object, error: string | null }): string[]`; registry field `paused: string[]`.

- [ ] **Step 1: Write the failing tests** in `watch.test.mjs` (`green`, `at`, `CTX`, `NO_TAB`, `RUNNING`, `jenkinsKo` already exist there):

```js
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

test("keepPaused drops closed PRs, keeps all on a failed round", () => {
  const prs = { "o/a#1": {}, "o/a#2": {} };
  assert.deepEqual(keepPaused(["o/a#1", "o/a#3"], { prs, error: null }), ["o/a#1"]);
  assert.deepEqual(keepPaused(["o/a#3"], { prs, error: "gh: HTTP 502" }), ["o/a#3"]);
  assert.deepEqual(keepPaused(undefined, { prs, error: null }), []);
});
```

Add `keepPaused` to the test file's import line.

- [ ] **Step 2: Run, expect FAIL**

Run: `node --test ~/.config/herdr-app/mods/status-jc/watch.test.mjs`
Expected: FAIL (`keepPaused` is not exported).

- [ ] **Step 3: Implement**
  - `LABELS.paused = "en pause"`.
  - In `decide`, right after the `tab.busy` return and before the attempts reset loop: when `ctx.paused`, return `out(LABELS.paused, \`en pause ; ${ci}\`)` with `ci` = `"un check en échec"` if `state("jenkins") === "ko" || state("sonar") === "ko" || s.failing`, else `"CI en cours"` if `state("jenkins") === "running" || state("sonar") === "running" || s.pending`, else `"CI verte"` if `s.reported`, else `"aucun check"`.
  - `keepPaused`: `registry.error` → `paused ?? []` unchanged; else keep the keys present in `registry.prs`.
  - `watcher.js` `ctx`: `paused: (registry.paused ?? []).includes(s.key)`.
  - `main.js`: `FRESH` gets `paused: []`; the end-of-round write becomes `{ ...next, on: cur?.on ?? next.on, paused: keepPaused(cur?.paused ?? next.paused, next) }` where `cur = shared(WATCH)` read at that moment. Import `keepPaused` from `./watch.js`.

- [ ] **Step 4: Run all mod tests and check the mod, expect PASS**

Run: `node --test ~/.config/herdr-app/mods/*/*.test.mjs && herdr-app check ~/.config/herdr-app/mods/status-jc`
Expected: all tests pass, `check passed`.

- [ ] **Step 5: Commit** `feat(herdr): pause one PR in the PR watch` (watch.js, watch.test.mjs, watcher.js, main.js).

### Task 2: Pause button in the PR panel

**Files:**
- Modify: `mods/pr/main.js:185-207` (`looks`, `row`)
- Modify: `README.md` (Surveillance paragraph), `docs/2026-11-14-pr-watch-design.md` (one line pointing to the pause design)

**Interfaces:**
- Consumes: registry `paused: string[]` and label `"en pause"` from Task 1.

- [ ] **Step 1: Implement**
  - `looks`: add `"en pause": [t.dim, "idle"]` right after `brouillon`, so it sorts with the drafts.
  - In `row`, between the spacer `div().flex_1()` and the `chip`: a small clickable element `id(\`pause-${k}\`)`, showing `▶` when `k` is in `reg?.paused`, else `⏸`, tooltip `"Reprendre"` / `"Mettre en pause"`. Its `on_click((_e, cx) => …)` calls `cx.stop_propagation()` first (pattern: `mods/agents/main.js:270`), then `setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg, paused: <reg.paused with k toggled> })`.
  - README: in the Surveillance paragraph, one sentence: the ⏸ button on a row pauses that PR (no agent, no toast; a running agent finishes), ▶ resumes it.

- [ ] **Step 2: Check the mod and run the tests**

Run: `herdr-app check ~/.config/herdr-app/mods/pr && node --test ~/.config/herdr-app/mods/*/*.test.mjs`
Expected: `check passed`, all tests pass.

- [ ] **Step 3: Try it in Herdr**: open the PR panel, click ⏸ on a watched PR, and check that the row turns ▶ without opening the PR. Within one round (5 min), the label should read "en pause ; …". Click ▶ and check the PR goes back to its normal label on the next round.

- [ ] **Step 4: Commit** `feat(herdr): add a pause button to the PR watch rows` (pr/main.js, README.md, the design doc).
