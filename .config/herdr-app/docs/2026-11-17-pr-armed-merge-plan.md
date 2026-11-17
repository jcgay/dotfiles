# Merge armé : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**But :** depuis le résumé de la PR du panneau `pr`, armer un « rebase and merge » que `status-jc` exécute dès que tous les checks du commit de tête sont verts.

**Architecture :** le panneau écrit les PR armées dans `shared("pr-merge")`. Une décision pure (`mods/status-jc/merge.js`) dit, pour chaque PR armée, s'il faut attendre, désarmer ou merger. Un tour d'effets (`mods/status-jc/merger.js`), lancé toutes les 60 s par `status-jc/main.js`, appelle gh et réécrit le registre sans perdre un clic fait pendant le tour.

**Tech :** mods Herdr (JS gpui-kit, module `herdr`), `node:test`, `gh`.

**Spec :** `~/.config/herdr-app/docs/2026-11-17-pr-armed-merge-design.md` (à lire d'abord).

## Contraintes globales

- On ne touche qu'à `mods/status-jc/` et `mods/pr/`, aux README (`mods/pr/README.md`, `mods/status-jc/README.md`, `.config/herdr-app/README.md`) et au design. Jamais `gpui-kit.d.ts` ni `jsconfig.json`.
- `merge.js` n'importe rien de `herdr` ; il peut importer `checks` de `./watch.js` (même dossier). Un mod ne peut pas importer hors de son dossier.
- Pas de `structuredClone` ni de `setTimeout` (`cx.timer`) ; tout appel externe passe par `exec` dans `cx.spawn`.
- Registre : clé `"<owner>/<repo>#<N>"` → `{ head, at, why, error }` (`at` : `Date.now()` de l'armement, il identifie l'armement).
- Merge : `gh pr merge <N> -R <owner>/<repo> --rebase`. Lecture : `gh pr view <N> -R <owner>/<repo> --json state,headRefOid,statusCheckRollup,commits`.
- Préfixes bloquants de titre de commit : `fixup!`, `amend!`, `squash!`.
- Textes : bouton `Merger quand tout est vert` ; ligne de tableau `Merge` ; toasts `PR #N fusionnée`, `PR #N : nouveau commit, merge annulé`, `PR #N : commit fixup!/amend!/squash!, merge annulé`, `PR #N : merge refusé` (corps : l'erreur gh).
- Travail dans un worktree yadm : `rtk proxy yadm worktree add --no-track -b pr-armed-merge ~/dev/agents-worktree/dotfiles/pr-armed-merge origin/master`. Push : `git push -u origin pr-armed-merge:pr-armed-merge` (le dépôt a `push.default upstream`). `gh` se lance hors de ce worktree (le shim mise refuse sa config). PR brouillon après le premier commit, puis suivre `~/.claude/docs/pr-trailer.md`.
- Commits : Conventional Commits `feat(herdr): …`, dernier trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests : `node --test mods/*/*.test.mjs` (depuis `.config/herdr-app` du worktree) ; mods : `herdr-app check <worktree>/.config/herdr-app/mods/<nom>`.

## Points à surveiller en revue

- Armer ou désarmer pendant un tour de merge : le tour ne doit ni effacer un nouvel armement ni ressusciter une PR désarmée (`applyResults` ne touche qu'une entrée dont `at` n'a pas changé).
- Un `gh pr merge` qui échoue alors que la PR est déjà `MERGED` (autre copie de `status-jc`, merge à la main) : succès, pas de toast d'erreur.
- Une PR dont un check passe `ko` puis repasse vert après un `jk run rerun` : elle reste armée et fusionne.
- `gh pr view` qui échoue (réseau, VPN) : la PR reste armée avec l'erreur, sans toast à chaque minute.
- Le bouton ne doit apparaître que sur une PR `OPEN` non brouillon ; sur une PR armée il cède la place à la ligne `Merge` avec ✕.

---

### Tâche 0 : worktree et branche

- [ ] Créer le worktree (commande des contraintes globales), vérifier `git -C ~/dev/agents-worktree/dotfiles/pr-armed-merge status -sb` : `## pr-armed-merge` sans upstream.

### Tâche 1 : décision pure `merge.js`

**Fichiers :**
- Créer : `.config/herdr-app/mods/status-jc/merge.js`
- Test : `.config/herdr-app/mods/status-jc/merge.test.mjs`

**Interfaces :**
- Consomme : `checks(rollup)` de `./watch.js` → `[{ name, state: "ok" | "ko" | "running", url }]`.
- Produit :
  - `export const ARMED = "pr-merge"`
  - `export function mergeStep(key, view, armed)` → `{ action: "drop" | "wait" | "merge", why: string | null, toast: string | null }`. `key` : `"o/r#N"` ; `view` : JSON de `gh pr view` ; `armed` : l'entrée du registre.
  - `export function applyResults(current, results)` → nouveau registre. `current` : registre relu en fin de tour ; `results` : `[{ key, at, drop: boolean, why, error }]`. Une entrée n'est touchée que si `current[key]?.at === at` ; `drop` la supprime, sinon `why` et `error` sont écrits.

- [ ] **Étape 1 : tests qui échouent**, dans le style de `watch.test.mjs` (`node:test`, `assert/strict`). Avec `armed = { head: "abc", at: 1 }`, `ok = [{ context: "continuous-integration/jenkins/pr-merge", state: "SUCCESS" }]` :
  - `mergeStep("o/r#7", { state: "MERGED", headRefOid: "abc", statusCheckRollup: ok, commits: [] }, armed)` → `{ action: "drop", why: null, toast: null }` (idem `CLOSED`).
  - tête `"def"` → `action: "drop"`, `toast: "PR #7 : nouveau commit, merge annulé"`.
  - un commit `{ messageHeadline: "amend! Fix x" }` (puis `fixup! `, `squash! `) → `action: "drop"`, `toast: "PR #7 : commit fixup!/amend!/squash!, merge annulé"` ; un titre `"Fix fixup! handling"` ne bloque pas.
  - `statusCheckRollup: []` → `{ action: "wait", why: "aucun check sur ce commit", toast: null }`.
  - un check `PENDING` → `action: "wait"`, `why: "CI en cours"`.
  - un check `FAILURE` (et aucun en cours) → `action: "wait"`, `why: "un check en échec"`.
  - tout `SUCCESS` → `{ action: "merge", why: null, toast: null }`.
  - L'ordre des règles est celui du tableau du design : fermée, nouvelle tête, fixup, puis checks (un commit fixup avec une CI en cours → `drop`).
  - `applyResults({ "o/r#7": { head: "abc", at: 1 } }, [{ key: "o/r#7", at: 1, drop: true }])` → `{}`.
  - même chose avec `at: 2` dans `current` (réarmé pendant le tour) → inchangé.
  - clé absente de `current` (désarmée pendant le tour) → toujours absente.
  - `drop: false, why: "CI en cours", error: null` → l'entrée garde `head` et `at`, avec `why` et `error` à jour.

- [ ] **Étape 2 :** `node --test mods/status-jc/merge.test.mjs` → échec (module absent).
- [ ] **Étape 3 :** écrire `merge.js`. Pas de copie avec `structuredClone` : spread ou JSON.
- [ ] **Étape 4 :** `node --test mods/*/*.test.mjs` → tout passe.
- [ ] **Étape 5 :** commit `feat(herdr): decide when an armed PR merge runs`, push, ouvrir la PR brouillon sur `jcgay/dotfiles` (corps en français ou anglais comme les PR récentes, signature des règles GitHub).

### Tâche 2 : le tour de merge dans `status-jc`

**Fichiers :**
- Créer : `.config/herdr-app/mods/status-jc/merger.js`
- Modifier : `.config/herdr-app/mods/status-jc/main.js` (`init`, à côté des minuteurs de la surveillance)
- Modifier : `.config/herdr-app/mods/status-jc/README.md`

**Interfaces :**
- Consomme : `ARMED`, `mergeStep`, `applyResults` (tâche 1).
- Produit : `export async function mergeRound()` → `void`. Lit `shared(ARMED)`, ne fait rien s'il est vide ou absent.

- [ ] **Étape 1 : `mergeRound()`**. Bail `shared("pr-merge-lease")` comme `round()` de `watcher.js` (même durée `LEASE_MS`, même relâche en `finally`). Pour chaque PR armée, en séquence : `gh pr view` (voir contraintes) ; sur échec, résultat `{ drop: false, why: null, error: <1re ligne stderr> }`, sans toast. Sinon `mergeStep` ; `toast` → `notify({ title, body: <url de la PR>, level: "warning" })`. Sur `merge` : `gh pr merge` ; succès → `drop: true`, `notify({ title: "PR #N fusionnée", body: url, level: "info" })` ; échec → relire `gh pr view <N> -R <repo> --json state` : `MERGED` compte comme succès, sinon `drop: true`, toast `PR #N : merge refusé` avec l'erreur en corps. À la fin : `setShared(ARMED, applyResults(shared(ARMED) ?? {}, results))`.
  - Choix délibéré : un merge refusé désarme (le design le dit) ; l'erreur reste visible par le toast. L'URL de la PR : `https://github.com/<repo>/pull/<N>`.
- [ ] **Étape 2 : minuteur.** Dans `init` : `cx.timer.every(60000, (cx) => this.merge(cx))`, avec un garde `this.merging` comme `this.watching`. Une exception du tour est loguée (`console.log("merge:", …)`), jamais remontée.
- [ ] **Étape 3 :** `herdr-app check ~/dev/agents-worktree/dotfiles/pr-armed-merge/.config/herdr-app/mods/status-jc` → OK ; `node --test mods/*/*.test.mjs` → OK.
- [ ] **Étape 4 : README `status-jc`** : une section « Merge armé » (registre, fréquence, tableau du design, bail) et `merge.js` / `merger.js` dans la liste des fichiers.
- [ ] **Étape 5 :** commit `feat(herdr): merge armed PRs once their checks are green`, push.

### Tâche 3 : le bouton dans le résumé de la PR

**Fichiers :**
- Modifier : `.config/herdr-app/mods/pr/main.js` (`FIELDS` ligne 10, rendu du `body` lignes 183-197)
- Modifier : `.config/herdr-app/mods/pr/README.md`, `.config/herdr-app/README.md` (§ Panneau PR)

**Interfaces :**
- Consomme : le registre `shared("pr-merge")` (forme dans les contraintes). Le panneau ne peut pas importer `ARMED` de `status-jc` : il écrit la chaîne `"pr-merge"` en clair, avec un commentaire qui renvoie à `status-jc/merge.js`.

- [ ] **Étape 1 :** ajouter `headRefOid` à `FIELDS`. Clé de la PR : `owner/repo` tiré de `pr.url` (`github.com/<owner>/<repo>/pull/<N>`) + `#` + `pr.number`.
- [ ] **Étape 2 :** PR `OPEN`, non brouillon, non armée : sous le tableau, `button("pr-arm", "Merger quand tout est vert", …)` qui écrit `{ ...reg, [key]: { head: pr.headRefOid, at: Date.now(), why: null, error: null } }`.
- [ ] **Étape 3 :** PR armée : une ligne `["Merge", …]` ajoutée au `table([...])` : `armé` + ` · <why>` s'il y en a un, l'`error` en rouge (`t.ansi1`) dessous, et `icon("pr-disarm", "✕", "Désarmer", …)` qui retire la clé. Le bouton de l'étape 2 n'est pas affiché.
- [ ] **Étape 4 :** `herdr-app check …/mods/pr` → OK ; `node --test mods/*/*.test.mjs` → OK.
- [ ] **Étape 5 : README** : dans `mods/pr/README.md`, le schéma « Ce que tu vois » (ligne `Merge`, bouton) et une puce ; dans `.config/herdr-app/README.md`, une phrase dans § Panneau PR ; lien vers le design en bas du README `pr`.
- [ ] **Étape 6 :** commit `feat(herdr): arm a rebase and merge from the PR summary`, push.

### Tâche 4 : vérification réelle

Herdr exécute les mods de `~/.config/herdr-app`, pas du worktree : cette tâche se fait une fois la PR fusionnée et `yadm pull` fait (ou par moi à la main avant).

- [ ] Sur une PR de test à CI rapide : armer, voir `Merge armé · CI en cours`, puis le merge et le toast à la fin du build.
- [ ] Pousser un commit après armement : désarmé avec le toast « nouveau commit ».
