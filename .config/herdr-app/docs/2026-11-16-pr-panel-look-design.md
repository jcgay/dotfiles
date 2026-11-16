# Look of the PR panel's own-PR block

## Why

The block that shows the shown space's pull request (`mods/pr`) stacks everything
flat under uppercase section titles: it is plain to look at, and the three things
I check when I switch spaces (the PR, its build, where it is deployed) do not stand
out from the rest. The PR watch below it is out of scope and does not change.

## Goals

- Read, at a glance and in this order: the PR, the build state, where it is deployed.
- Everything else (checks, tests, branches, reviewers) stays reachable but quieter.
- A layout that keeps its shape from one PR to the next.

Non-goals: the watch section, the data fetched (gh, jk, Docker scan), refresh logic.
Anti-goal: a block taller than today for the usual PR.

## Approaches

Three looks were mocked up (theme `ghostty`):

- A, stacked cards: one card per priority item, a colored edge for the PR state,
  a progress bar while building. Nicest, but tallest.
- **B, header plus three status rows (picked)**: one aligned row per question,
  checks folded. Most readable at a glance, most compact.
- C, global status banner: a colored banner for the build on top, deployments as
  pills. Very visible, but the PR itself comes second.

Only one way to build it makes sense: rewrite the PR part of `render()` in
`mods/pr/main.js` with the mod's existing pieces (`dot`, `chip`, `button`, theme
colors). No library, no separate mod.

## Design (B)

- **Header**: PR title (14, semibold); below it `#n`, state chip, review chip,
  `+add −del`, as today.
- **Status table**, bordered, rounded, one row per item, label column on the left (dim, 11):
  - **Build**: dot, `#n <state>`, duration right-aligned (`elapsed / ~estimate` while
    running). A red sub-line counts tests when some fail (else muted). Unreachable
    Jenkins: dim "Jenkins injoignable (VPN ?)". Row absent when the PR has no Jenkins build.
  - **Déployée**: one clickable URL per line; dim "nulle part" when none, so the
    table keeps its shape.
  - **Checks**: dot of the worst state and a summary (`1 en échec · 2 ✓ · 1 en cours`),
    folded by default; a click unfolds the per-check list (each clickable as today).
    The Jenkins check is left out: the Build row already shows it. Row absent when
    no other check exists.
- **Under the table**, small and dim: `head → base`, then reviewers asked.
- **No button row**: the PR title opens the PR on GitHub, the build line opens the
  Jenkins build, and the Build row carries two glyph buttons, 📜 (console log) and
  🔁 (rerun, when the finished build did not succeed).
- **No PR**: the message, the Déployée row if a deployment was found, the
  Créer la PR button. No branch and error states stay as today.

## Left to the builder

- Filtering Jenkins checks and the summary text live in `model.js` (pure, tested in
  `model.test.mjs`); the fold state is a view field (`this.checksOpen`), kept across spaces.
- Exact spacing and colors, within the theme's names.
- Update `.config/herdr-app/README.md` if it describes the panel.
