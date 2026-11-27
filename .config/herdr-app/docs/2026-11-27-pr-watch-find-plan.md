# Retrouver une PR et voir ce qui m'attend : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la Surveillance ne suit plus les brouillons qu'aucun space ne montre, et sa liste montre « À toi » en tête puis les PR groupées par dépôt, titre visible et space nommé.

**Architecture:** `status-jc` filtre les brouillons au début du tour (règle pure dans `watch.js`), ce qui les fait sortir comme une PR mergée (onglets, journal, compteur). Le panneau `pr` découpe la liste en sections par une fonction pure de `model.js` et ne change que son rendu.

**Tech Stack:** mods Herdr en JS (gpui-kit), tests `node:test`.

**Spec:** `~/.config/herdr-app/docs/2026-11-27-pr-watch-find-design.md`

## Global Constraints

- `watch.js` et `model.js` n'importent rien de `herdr` (Node doit les charger pour les tests).
- Un mod n'importe pas les fichiers d'un autre : une règle partagée est recopiée, avec un commentaire qui le dit.
- Commits sur `master` (yadm, `cd ~`), Conventional Commits (`feat(status-jc): …`, `feat(pr): …`), corps en anglais, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chaque commit met à jour les README qu'il touche : `mods/status-jc/README.md`, `mods/pr/README.md`, `.config/herdr-app/README.md`, et l'aide du panneau (`LABEL_HELP`, texte d'intro de `help` dans `pr/main.js`).
- Tous les tests : `node --test ~/.config/herdr-app/mods/*/*.test.mjs` ; vérification d'un mod : `herdr-app check ~/.config/herdr-app/mods/<name>`.

## Review Focus

- **Herdr qui démarre** : au premier tour, `spaces()` n'a pas encore les spaces restaurés. Un brouillon déjà suivi ne doit pas sortir (puis revenir) pour ça : tant que la disposition locale n'est pas prête (`machines().find((m) => m.name === null)?.layout !== "ready"`, comme `opener.js`), un brouillon déjà dans le registre reste suivi, un nouveau n'entre pas.
- **Brouillon montré par une pane d'un sous-dossier** du worktree (`…/wt/src`) : il compte comme montré.
- **Brouillon dont la lecture gh a échoué** (`s.error`, pas de `draft`) : il reste dans la liste avec son erreur, comme aujourd'hui.
- **Navigation clavier** : ↑/↓ suit l'ordre affiché (À toi, puis les groupes), une PR n'y apparaît qu'une fois.
- **Merge refusé sur une PR non « à toi »** : elle va dans la section À toi (même règle que `waitingOnMe`), pas dans son groupe.

---

### Task 1: ne surveiller un brouillon que si un space le montre

**Files:**
- Modify: `mods/status-jc/watch.js` (à côté de `checkoutsOf`)
- Modify: `mods/status-jc/watcher.js` (`roundUnderLease`, juste après le calcul de `repos` / `cache.clones`)
- Test: `mods/status-jc/watch.test.mjs`
- Docs: `mods/status-jc/README.md` (« Quand et quoi »), `mods/pr/README.md`, `.config/herdr-app/README.md` (§ Surveillance), `mods/pr/main.js` (`LABEL_HELP.brouillon`, intro de `help`)

**Interfaces:**
- Produces: `export function draftShown(folders: string[], porcelain: string, branch: string): boolean` dans `watch.js`.

- [ ] **Step 1: tests de `draftShown`**

```js
const WT = "worktree /r/x\nHEAD a\nbranch refs/heads/master\n\nworktree /r/wt/feat-x\nHEAD b\nbranch refs/heads/feat/x\n";
test("draftShown: a space on the branch's worktree shows the draft", () => assert.equal(draftShown(["/r/wt/feat-x"], WT, "feat/x"), true));
test("draftShown: a pane in a subfolder of it too", () => assert.equal(draftShown(["/r/wt/feat-x/src"], WT, "feat/x"), true));
test("draftShown: a sibling folder sharing the prefix does not", () => assert.equal(draftShown(["/r/wt/feat-x2"], WT, "feat/x"), false));
test("draftShown: the main checkout on another branch does not", () => assert.equal(draftShown(["/r/x"], WT, "feat/x"), false));
test("draftShown: no checkout of the branch", () => assert.equal(draftShown(["/r/wt/feat-x"], WT, "feat/y"), false));
test("draftShown: a prunable worktree does not", () => assert.equal(draftShown(["/r/wt/feat-x"], WT.replace("feat/x\n", "feat/x\nprunable gitdir file points to non-existent location\n"), "feat/x"), false));
```

- [ ] **Step 2:** `node --test mods/status-jc/watch.test.mjs` → échec, `draftShown` non exporté.
- [ ] **Step 3:** implémenter `draftShown` : vrai si un dossier vaut un des `checkoutsOf(porcelain, branch)` ou commence par `<checkout>/`.
- [ ] **Step 4:** les tests passent.
- [ ] **Step 5: filtrer le tour dans `watcher.js`.** Après `cache.clones = …`, remplacer `all` par les PR suivies :
  - les dossiers locaux : spaces sans `machine` et cwd de leurs panes (même calcul que `findClone`) ;
  - `ready` comme dans `opener.js` (importer `machines` depuis `herdr`) ;
  - gardée si `!s.draft` ou `s.error`, sinon si `ready` : `draftShown(folders, repos.get(s.repo).worktrees, s.branch)`, sinon (pas prêt) : `s.key in registry.prs`.
  
  Tout ce qui suit (`roundPrs`, `karadocPrs`, la boucle, `markersOf` qui ferme les onglets d'une PR absente du tour, le journal « sortie de la surveillance ») lit le `all` filtré : aucun autre changement.
  Les `worktrees` de `cloneOf` sont lus avant les lancements du tour : un worktree créé pendant ce tour compte au suivant (déjà le cas pour ⌨).
- [ ] **Step 6:** `node --test ~/.config/herdr-app/mods/*/*.test.mjs` et `herdr-app check ~/.config/herdr-app/mods/status-jc` passent ; `herdr-app status` sans erreur de mod. Au tour suivant, `tail ~/Library/Logs/herdr-watch.log` montre « sortie de la surveillance » pour vidal-mcp #410, #400, #297, #262, #207 et le compteur de la barre d'état ne les compte plus.
- [ ] **Step 7: docs**, puis commit `feat(status-jc): watch a draft only while a space shows it`. Le corps dit pourquoi (brouillons délaissés gardés dans la fenêtre des 7 jours par les pushs des agents) et l'effet accepté sur les brouillons de **Corriger**.

### Task 2: la liste « À toi » puis par dépôt

**Files:**
- Modify: `mods/pr/model.js`, `mods/pr/main.js` (rendu `watch`, `row`, `this.keys`)
- Test: `mods/pr/model.test.mjs`
- Docs: `mods/pr/README.md` (croquis « Ce que tu vois » et puces), `.config/herdr-app/README.md` (§ Surveillance : tri et repli d'une PR ok)

**Interfaces:**
- Produces:
  - `export function watchSections(entries: [key, entry][], merges: object, rank: (label) => number): { title: string | null, repo: string | null, rows: [key, entry][] }[]` : la première section `{ title: "À toi", repo: null }` si non vide, puis une par dépôt `{ title: <nom court du dépôt>, repo: "owner/name" }`.
  - `export function spaceShowing(work: { folder } | null, spaces: { name: string, folders: string[] }[]): string | null`.

- [ ] **Step 1: tests**

```js
const rank = (l) => ["à toi", "erreur", "agent en cours", "en attente", "ok"].indexOf(l);
const E = (label) => ({ label });
test("watchSections: mine first, then repos by their most urgent PR, a PR shown once", () => {
  const s = watchSections([["o/b#1", E("ok")], ["o/a#2", E("en attente")], ["o/b#3", E("à toi")], ["o/a#4", E("ok")], ["o/b#5", E("erreur")]], {}, rank);
  assert.deepEqual(s.map((x) => [x.title, x.rows.map(([k]) => k)]), [["À toi", ["o/b#3"]], ["b", ["o/b#5", "o/b#1"]], ["a", ["o/a#2", "o/a#4"]]]);
});
test("watchSections: a refused merge goes to À toi", () => {
  assert.equal(watchSections([["o/a#1", E("ok")]], { "o/a#1": { refused: true } }, rank)[0].title, "À toi");
});
test("watchSections: no À toi section when nothing waits on me", () => {
  assert.deepEqual(watchSections([["o/a#1", E("ok")]], {}, rank).map((x) => x.title), ["a"]);
});
test("watchSections: two owners' repos of one name keep their owner", () => {
  assert.deepEqual(watchSections([["o/a#1", E("ok")], ["p/a#2", E("ok")]], {}, rank).map((x) => x.title), ["o/a", "p/a"]);
});
test("spaceShowing: the space whose folders hold the worktree", () => {
  const sp = [{ name: "renono", folders: ["/r/wt/x/src"] }];
  assert.equal(spaceShowing({ folder: "/r/wt/x" }, sp), "renono");
  assert.equal(spaceShowing({ folder: "/r/wt/y" }, sp), null);
  assert.equal(spaceShowing(null, sp), null);
});
```

Ordre des groupes à rang égal : nom du dépôt. Dans un groupe et dans À toi : par `rank`, stable (ordre du registre). « À toi » suit `waitingOnMe` de `status-jc/watch.js` (étiquette « à toi », ou `merges[k].refused`), recopiée avec un commentaire.

- [ ] **Step 2:** `node --test mods/pr/model.test.mjs` → échec, fonctions non exportées.
- [ ] **Step 3:** implémenter `watchSections` et `spaceShowing` dans `model.js` ; `workLook` réutilise la même règle « dossier égal ou en dessous ».
- [ ] **Step 4:** les tests passent.
- [ ] **Step 5: rendu dans `main.js`.**
  - `sorted` (filtrée par `hiddenDraft`) passe par `watchSections(…, merges, rank)` ; chaque section a un en-tête discret (`section(...)` existant ou équivalent ; « À toi (N) » avec le compte), puis ses lignes.
  - `this.keys` = les clés dans l'ordre affiché, sections aplaties.
  - `row` prend `showRepo` : vrai dans À toi, faux dans un groupe (le nom du dépôt est dans l'en-tête).
  - `folded` ne masque plus le titre : seule l'explication (`why`) se replie ; l'infobulle d'une ligne repliée n'est plus le titre.
  - Les spaces locaux deviennent `[{ name, folders }]` (au lieu du seul tableau `local`, que `workLook` reçoit aplati) ; une ligne dont `spaceShowing(entry.work, …)` rend un nom l'affiche après le numéro, en `t.dim`, `space <nom>`.
- [ ] **Step 6:** tests et `herdr-app check ~/.config/herdr-app/mods/pr` passent ; `herdr-app shot` du panneau ouvert (`⌘⇧U`) montre À toi puis les groupes, les titres des PR ok, le nom du space d'une PR montrée ; ↑/↓ parcourt les lignes dans cet ordre.
- [ ] **Step 7: docs**, puis commit `feat(pr): list the watch by what waits on me, then by repository`.
