# PR panel look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the own-PR block of the `pr` panel as a header plus a Build / Déployée / Checks table.

**Architecture:** One pure helper in `mods/pr/model.js` (the checks summary, tested with `node:test`); the rest is the PR part of `render()` in `mods/pr/main.js`, built with the mod's existing `dot`, `chip`, `button` and theme colors. Data fetching, caches and the watch section do not change.

**Tech Stack:** Herdr mod (gpui-kit / gpui-base / herdr imports), Node `node:test`.

**Spec:** `.config/herdr-app/docs/2026-11-16-pr-panel-look-design.md`

## Global Constraints

- Only the own-PR block changes; the "Surveillance" section (`watch` in `render()`) stays byte-identical.
- French UI copy, exactly: `Build`, `Déployée`, `Checks`, `nulle part`, `Jenkins injoignable (VPN ?)`, `en échec`, `en cours`, `✓`.
- Colors are theme names from `theme()` (`t.done`, `t.ansi1`, `t.working`, `t.dim`, `t.muted`, `t.border`, `t.accent`, `t.hover`), never hex.
- `model.js` imports nothing from Herdr.
- Commits: Conventional Commits `feat(herdr): …`, footer `Closes #39` then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `rtk proxy yadm add <files>` (never the whole mod folder, never `gpui-kit.d.ts`/`jsconfig.json`), then `rtk proxy yadm push -q origin herdr-pr-panel-look:herdr-pr-panel-look`.

## Review Focus

- PR with only the Jenkins check: the Checks row disappears (no "0 ✓" row). Pinned in Task 1 (`summary([])` is `null`).
- Long deployment URLs or check names: truncate on one line, the panel never scrolls horizontally. Checked in Task 2 screenshot.
- Running build: the duration ticks (`elapsed / ~estimate`) as today, dot pulses. Task 2 visual check.
- Switching spaces while checks are unfolded: stays unfolded (view field), no crash when the new PR has no checks. Task 2 manual check.
- No PR but a deployment found: table shows only the Déployée row. Task 2 manual check.

---

### Task 1: Checks summary helper

**Files:**
- Modify: `.config/herdr-app/mods/pr/model.js` (after `checks`)
- Test: `.config/herdr-app/mods/pr/model.test.mjs`

**Interfaces:**
- Produces: `summary(list: {state: "ok"|"ko"|"running"}[]) -> { state: "ok"|"ko"|"running", text: string } | null`. `state` is the worst one (ko > running > ok). Text parts in this order, omitted when 0, joined by ` · `: `<n> en échec`, `<n> en cours`, `<n> ✓`. `null` for an empty list.

- [ ] **Step 1: Write the failing test** `test("checks summary", …)`:
  - `summary([])` → `null`
  - `summary([{state:"ok"},{state:"ok"},{state:"ok"}])` → `{ state: "ok", text: "3 ✓" }`
  - `summary([{state:"ok"},{state:"ko"},{state:"running"},{state:"ok"}])` → `{ state: "ko", text: "1 en échec · 1 en cours · 2 ✓" }`
  - `summary([{state:"running"},{state:"ok"}])` → `{ state: "running", text: "1 en cours · 1 ✓" }`
- [ ] **Step 2:** `node --test ~/.config/herdr-app/mods/pr/model.test.mjs` → FAIL (`summary` not exported).
- [ ] **Step 3:** Implement and export `summary` in `model.js`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(herdr): summarize a PR's checks in one line` (body: why, per git rules).

### Task 2: Status table in the PR block

**Files:**
- Modify: `.config/herdr-app/mods/pr/main.js` (`init`: add `this.checksOpen = false`; `render`: the `body` expression and the `deployed` helper)
- Modify: `.config/herdr-app/README.md` § "Panneau PR", first sentence, to say the block shows the PR, then build, deployments and folded checks.

**Interfaces:**
- Consumes: `summary` (Task 1); existing `checks`, `jenkinsBuild`, `minutes`, `dot`, `chip`, `button`.

- [ ] **Step 1:** Build the list as `otherChecks(checks(pr.statusCheckRollup), b)` (in `model.js`, tested): it drops only the check of the build the Build row shows, unless that build is unreachable; other Jenkins jobs stay.
- [ ] **Step 2:** Replace the PR branch of `body` (spec § Design B), in order:
  1. title + `#n` / state chip / review chip / `+add −del` line (unchanged);
  2. a table `v_flex().mt(12).rounded(8).border_1().border_color(t.border).overflow_hidden()` whose rows are `h_flex().gap(8).px(10).py(8).items_start()` separated by `border_t(1)` (not on the first), each with a label `div().w(64).flex_none().text_size(11).text_color(t.dim)`:
     - **Build** (only if `b`): unreachable → dim text; else dot + `#n <state word>` + right-aligned duration (existing formulas); a sub-line `text_size(11)` with tests when `b.tests?.total`, `t.ansi1` if failures else `t.muted`.
     - **Déployée** (always): each URL a clickable truncated `t.accent` line opening with `exec("open", [url])`; none → dim `nulle part`.
     - **Checks** (only if `summary(list)`): a clickable line (dot of `summary.state`, text, right-aligned `⌄`/`›`) toggling `this.checksOpen` then `cx.notify()`; when open, the existing per-check rows (clickable, truncated) below it.
  3. `div().pt(8).text_size(11).text_color(t.dim)`: `head → base`, plus ` · revue demandée à <logins>` when any;
  4. no buttons row: the title opens the PR, the build line opens Jenkins, 📜 and 🔁 sit on the Build row.
- [ ] **Step 3:** No-PR branch: message, then the table with only the Déployée row when `this.deployed.length`, then `Créer la PR`. No-branch and error branches unchanged.
- [ ] **Step 4:** `herdr-app check ~/.config/herdr-app/mods/pr` → no error; `node --test ~/.config/herdr-app/mods/*/*.test.mjs` → all pass.
- [ ] **Step 5:** Visual check in Herdr (the mod reloads on save): open the PR panel on a space with a PR, a space without PR, and with Jenkins off-VPN if possible; screenshot via the debug tool in `AGENTS.md` if available, else ask the user to look. Walk the Review Focus list.
- [ ] **Step 6:** Commit `feat(herdr): show a PR's build, deployments and checks as a table`, with README; push.
