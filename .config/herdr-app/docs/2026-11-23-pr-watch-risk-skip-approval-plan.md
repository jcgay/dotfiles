# Pas d'approbation quand pr-risk n'en demande pas : plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une PR dont le verdict `pr-risk` à 0 humain porte sur l'arbre du head passe `appr`, squashe ses fixups et finit « ok » sans approbation ; le merge reste manuel.

**Architecture:** `pr-risk` écrit le sha analysé sur la 2e ligne de son commentaire. `watch.js` lit le verdict (pur), `watcher.js` compare les arbres avec `gh api` (cache par sha) et retire le marqueur `pr-risk` d'un verdict périmé, ce qui relance l'étape. `decide()` et `bandOf()` traitent « 0 humain sur le head » comme une approbation pour le squash et la case `appr`.

**Tech Stack:** JavaScript des mods Herdr, `node:test`, `gh`.

**Spec:** `.config/herdr-app/docs/2026-11-23-pr-watch-risk-skip-approval-design.md`

## Global Constraints

- 1re ligne du commentaire inchangée : `<!-- pr-risk -->` ; 2e : `<!-- pr-risk-head: <sha complet> -->`.
- Titre lu : `## PR risk: <TIER> · <N> human review(s)`.
- Le merge n'est jamais armé par la surveillance.
- Aucune import `herdr` dans `watch.js` / `pipeline.js`.
- Commits Conventional (`feat(herdr): ...`), READMEs touchés dans le même commit.

## Review Focus

- Verdict périmé dont l'agent `pr-risk` s'arrête sans reposter : pas de relance en boucle (le `silent` du head l'arrête). Test dans la tâche 2.
- Head qui bouge pendant que `pr-risk` tourne : son verdict posté est périmé, son onglet doit quand même se fermer et `pr-risk` repartir sur le nouveau head. Test dans la tâche 2.
- `gh api` du commit en échec (sha disparu après force-push) : `onHead` à null, comportement d'aujourd'hui, pas de relance. Test dans la tâche 2.
- Verdict à 0 humain sur une PR approuvée : rien ne change (squash et `appr` comme aujourd'hui). Test dans la tâche 2.
- Titre `Medium · 1 human review` ou commentaire d'un autre auteur : ignoré. Test dans la tâche 1.
- Brouillon : aucune review, donc aucun effet. Couvert par le chemin `s.draft` existant.

---

### Task 1: lire le verdict

**Files:** Modify `.config/herdr-app/mods/status-jc/watch.js`, test `watch.test.mjs`.

**Interfaces:**
- Produces: `riskOf(comments, me) -> { humans: number|null, sha: string|null } | null` ; `signalsOf(...).risk` = `riskOf(view.comments, me)` complété de `onHead: sha === head ? true : null` ; `noHuman(s) -> boolean` = `s.risk?.humans === 0 && s.risk.onHead === true` ; `staleRisk(s)` = `humans === 0 && onHead === false && !s.approved` ; `withRiskTree(s, same) -> s` : `same` (true/false/null) devient `risk.onHead`, et un verdict périmé échange le marqueur `pr-risk` contre `pr-risk-stale`, que `closing()` ne ferme qu'agent `done` ou `idle`. `noHuman` exige aussi `!s.changesRequested`.

- [ ] Tests : `riskOf` lit 0, 1, 2 humains et le sha ; `null` sans commentaire à moi ; `sha: null` sans 2e ligne. `signalsOf` met `onHead: true` quand le sha est le head. `withRiskTree` : false sur PR non approuvée retire le marqueur, false approuvée le garde, null ne change rien.
- [ ] Implémenter, `node --test` vert.

### Task 2: décider avec le verdict

**Files:** Modify `watch.js` (`decide`), `pipeline.js` (`bandOf`), `watcher.js` (`signals`), tests `watch.test.mjs`, `pipeline.test.mjs`.

**Interfaces:** Consumes `noHuman`, `withRiskTree`.

- [ ] Tests `decide` : `noHuman` + fixups + reviews faites → launch `squash` ; sans fixups → `ok` avec « pr-risk : 0 revue humaine, merge à toi » dans le pourquoi ; humains 1 → pas de squash ; verdict périmé (marqueur retiré) → launch `pr-risk` ; même chose avec `silent: { h1: ["pr-risk"] }` → pas de relance.
- [ ] Tests `bandOf` : `noHuman` sans fixups → `appr` `ok` ; avec fixups → `todo`.
- [ ] `decide` : `(s.approved || noHuman(s)) && s.fixups` pour le squash, phrase ajoutée au pourquoi « ok » quand `noHuman(s) && !s.approved`. `bandOf` : même condition pour `appr`.
- [ ] `watcher.js` : `signals()` appelle `withRiskTree(s, await sameTree(repo, s.risk.sha, s.head, cache))` quand `s.risk?.sha` diffère du head ; `sameTree` lit `.commit.tree.sha` des deux commits (`gh api repos/<repo>/commits/<sha> --jq .commit.tree.sha`), cache `cache.trees[sha]`, null sur erreur.
- [ ] `node --test`, `herdr-app check` de status-jc.

### Task 3: le skill, l'aide et les READMEs

**Files:** `.claude/skills/pr-risk/SKILL.md`, `.config/herdr-app/mods/pr/main.js` (`STEP_HELP.appr`), `mods/status-jc/README.md`, `mods/pr/README.md`, `.config/herdr-app/README.md`.

- [ ] `SKILL.md` : la 2e ligne dans le gabarit du commentaire, le sha de `gh pr view --json headRefOid` lu au moment de l'analyse.
- [ ] `STEP_HELP.appr` : « ton approbation sur GitHub (pas besoin si pr-risk dit 0 revue humaine sur ce code), puis le squash des fixup! ».
- [ ] READMEs : le nouveau cas, là où l'approbation est décrite.
- [ ] `herdr-app check` de `pr`, tous les tests, commit, PR brouillon.
