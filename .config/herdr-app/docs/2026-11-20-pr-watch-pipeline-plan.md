# Bande d'étapes de la surveillance : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chaque PR de la Surveillance montre une bande de 9 étapes, un temps restant et deux actions,
sous un bandeau global, avec un tour toutes les 2 minutes et à la demande.

**Architecture:** un module pur `status-jc/pipeline.js` calcule la bande, les mesures de durée,
l'estimation et l'état du worktree ; `watcher.js` l'appelle à chaque tour et écrit le résultat dans
l'entrée de la PR et dans le registre `pr-watch` ; le panneau `pr` ne fait que dessiner.

**Tech Stack:** mods Herdr (JS, gpui-kit), `node:test`.

**Spec:** `.config/herdr-app/docs/2026-11-20-pr-watch-pipeline-design.md`

## Global Constraints

- Un mod n'importe rien d'un autre mod : le panneau lit tout dans `shared(...)`.
- `pipeline.js` n'importe pas `herdr` (testé par `node --test`).
- Ordre et libellés de la bande : `git · jenk · sonar · rev · qa · demo · risk · appr · merge`.
- Historique : 10 dernières durées par étape, estimation à partir de 3 mesures (médiane).
- Tour toutes les 2 minutes ; la demande ↻ est relevée par le tick de 5 s.
- Commits : `feat(herdr): …`, footer `Closes #66` puis `Co-Authored-By`.

## Review Focus

- PR dont la lecture GitHub échoue (`s.error`) : bande, temps et worktree du tour précédent gardés.
- PR qui change de head pendant une mesure de CI : la mesure repart de zéro, aucun échantillon faux.
- Review fermée sans commentaire (`silent`) : ne compte pas dans l'historique, case en pointillé.
- Tour refusé (bail d'une autre copie) ou en erreur : `running` repasse à faux.
- Registre écrit par une version précédente (sans `band`, `durations`…) : le panneau garde l'ancien affichage.

---

### Task 1: module pur `pipeline.js`

**Files:**
- Create: `mods/status-jc/pipeline.js`, `mods/status-jc/pipeline.test.mjs`
- Modify: `mods/status-jc/watch.js` (exporter `BUDGET`, `REVIEW` ; `karadocHolder`)

**Interfaces (produits):**
- `STEPS: string[]` (les 9 libellés).
- `bandOf(s, e, ctx) → string[] | null` : états `ok | run | wait | ko | me | todo | skip`, 3 cases
  pour un brouillon, 9 sinon ; `e.band ?? null` si `s.error`. `ctx = { hasCi, hasQa, hasDemo, hasSonar }`.
- `measure(before, e, s, now) → { ci, samples }` : `ci = { jenkins, sonar }` trackers `{ head, since }`
  ou null ; `samples = [[key, ms]]`, clés `agent:<step>` et `ci:jenkins|sonar`.
- `addSamples(durations, samples, keep = 10) → durations`.
- `median(list) → number | null` (null sous 3 valeurs).
- `clockOf(e, durations, now) → { step, since, readyAt } | { yours: true } | null`.
- `workOf(porcelain, { draft, branch, watch }) → { folder, exists }`.
- `karadocHolder(busy, karadocPrs, roundPrs) → string | null` (watch.js ; `karadocHeld` s'en sert).

- [ ] Tests d'abord (`pipeline.test.mjs`) : bande d'une PR verte en review (`qa` lancé → `run`),
  conflit à budget épuisé (`git` = `me`), brouillon (3 cases), repo sans Sonar (`skip`), `silent`
  (`skip`), approbation attendue après les reviews (`appr` = `wait`) ; `measure` d'un agent fini avec
  marker (un échantillon), sans marker (aucun), d'un Jenkins qui finit sur le même head (un
  échantillon) et sur un autre head (aucun) ; `median` ; `clockOf` sans estimation, avec, et « à toi » ;
  `workOf` d'un brouillon sorti et d'un `-watch` absent.
- [ ] `node --test mods/status-jc/pipeline.test.mjs` échoue, implémenter, il passe ; toute la suite passe.
- [ ] Commit `feat(herdr): compute the watch's step band and timing`.

### Task 2: brancher le tour

**Files:** `mods/status-jc/watcher.js`, `mods/status-jc/main.js`

- [ ] `roundUnderLease` : `launched.at` posé au lancement ; pour chaque PR lue sans erreur, l'entrée
  reçoit `band`, `ci`, `fixups`, `draft`, `work` ; après la boucle, `durations` mis à jour puis `clock`
  de chaque entrée ; le registre reçoit `durations`, `sonarRepos`, `agents: { busy, max }`, `karadoc`.
- [ ] `main.js` : tour toutes les 120 000 ms, `every` et `running` dans le registre, demande
  `shared("pr-watch-now")` relevée dans le tick de 5 s.
- [ ] `herdr-app check mods/status-jc` et `node --test` passent ; commit
  `feat(herdr): run the watch every 2 minutes and on demand`.

### Task 3: le panneau

**Files:** `mods/pr/main.js`

- [ ] Bandeau (interrupteur, agents, karadoc, prochain tour, ↻), bande sous le titre, temps en tête de
  la ligne « pourquoi », icônes ⤵ et ⇥/✕, trois aspects de ⌨.
- [ ] `herdr-app check mods/pr` passe ; vérifier à l'écran ; commit
  `feat(herdr): show each watched PR's steps and actions`.

### Task 4: documentation

**Files:** `mods/pr/README.md`, `mods/status-jc/README.md`, `README.md`

- [ ] Mettre à jour les schémas et « toutes les 5 minutes » ; commit `docs(herdr): …`.
