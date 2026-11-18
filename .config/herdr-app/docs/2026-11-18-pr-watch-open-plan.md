# Travailler sur une PR de la surveillance : plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un bouton par ligne de la Surveillance ouvre un espace Claude dans le worktree de la PR (branche si brouillon, `-watch` mis en pause sinon), en le créant au besoin.

**Architecture:** le panneau `pr` écrit une demande dans `shared("pr-open")` ; `status-jc` la traite à son tick de 5 s (`opener.js`), pose la pause dans `shared("pr-watch").paused` et la lève quand l'espace du `-watch` est fermé. La logique décidable est pure dans `status-jc/open.js`.

**Tech Stack:** mods Herdr (JS, `herdr`/`gpui-kit`), `node:test`, `gh`, `git`, `wt`.

**Spec:** `~/.config/herdr-app/docs/2026-11-18-pr-watch-open-design.md`

## Global Constraints

- yadm, branche `pr-watch-open`, PR draft jcgay/dotfiles#59 : chaque commit porte `Closes #59` avant `Co-Authored-By`, préfixe `feat(herdr):` / `docs(herdr):`, pousser après chaque commit (`yadm push origin pr-watch-open:pr-watch-open`).
- Ne jamais `yadm add` un dossier de mod entier (`gpui-kit.d.ts`, `jsconfig.json`) : ajouter fichier par fichier.
- Un mod n'importe rien hors de son dossier ; `open.js` n'importe rien de `herdr` (testable sous Node).
- Le `-watch` existant n'est jamais remis sur origin ; chemin `${home()}/dev/agents-worktree/<nom du repo>/<branche>-watch`.
- Textes affichés en français : tooltip « Travailler dessus », « ouverture… ».
- Tests : `node --test ~/.config/herdr-app/mods/*/*.test.mjs` ; contrôle : `herdr-app check ~/.config/herdr-app/mods/<mod>`.

## Review Focus

- Deux copies de `status-jc` (deux fenêtres) relèvent la même demande : un seul espace doit s'ouvrir (Task 2, réclamation synchrone `asked` → `opening` avec l'id de la copie).
- Une PR déjà en pause à la main : l'ouverture ne doit pas la reprendre à la fermeture (Task 1, test `holdPause` sur clé déjà présente).
- Le tour de surveillance (5 min) réécrit `pr-watch` en fin de tour : la pause posée pendant le tour doit survivre ; elle y survit car `main.js` garde `cur.paused`, et l'état d'ouverture vit dans `pr-open`, jamais dans `pr-watch` (Task 2).
- Espace du `-watch` ouvert dans un autre onglet de Herdr puis fermé, ou Herdr redémarré : la pause se lève dès qu'aucun espace local n'a ce dossier (Task 1, `toRelease`).
- Clone local introuvable ou `wt`/`git` en échec : erreur sur la ligne, pas de pause, rien d'ouvert (Task 2).

---

### Task 1: décisions pures dans `status-jc/open.js`

**Files:**
- Create: `.config/herdr-app/mods/status-jc/open.js`
- Create: `.config/herdr-app/mods/status-jc/open.test.mjs`
- Modify: `.config/herdr-app/mods/status-jc/watcher.js` (`prepareWorktree` calcule son chemin avec `watchPath`)

**Interfaces:**
- Produces:
  - `watchPath(home: string, repo: string, branch: string): string` → `${home}/dev/agents-worktree/${repo.split("/")[1]}/${branch}-watch`
  - `holdPause(paused: string[], key: string): { paused: string[], held: boolean }` : ajoute `key` si absente (`held: true`), sinon inchangé (`held: false`).
  - `toRelease(open: Record<string, OpenEntry>, folders: string[]): string[]` : clés en état `"held"` dont `folder` n'est pas dans `folders`.
  - `OpenEntry` (valeur de `shared("pr-open")[key]`) : `{ state: "asked" | "opening" | "held" | "error", at: number, by?: string, folder?: string, error?: string }`.

- [ ] **Step 1: tests qui échouent** (`open.test.mjs`, en-tête comme `watch.test.mjs`)

```js
test("watchPath names the watch worktree after the repo and branch", () => {
  assert.equal(watchPath("/Users/x", "softwarevidal/arthur", "feat/a"), "/Users/x/dev/agents-worktree/arthur/feat/a-watch");
});
test("holdPause pauses a running PR and says it held it", () => {
  assert.deepEqual(holdPause(["o/r#1"], "o/r#2"), { paused: ["o/r#1", "o/r#2"], held: true });
});
test("holdPause leaves a PR paused by hand to the user", () => {
  assert.deepEqual(holdPause(["o/r#2"], "o/r#2"), { paused: ["o/r#2"], held: false });
});
test("toRelease frees held PRs whose folder has no space left", () => {
  const open = { "o/r#1": { state: "held", folder: "/a" }, "o/r#2": { state: "held", folder: "/b" }, "o/r#3": { state: "opening", at: 0 } };
  assert.deepEqual(toRelease(open, ["/b"]), ["o/r#1"]);
});
```

- [ ] **Step 2:** `node --test ~/.config/herdr-app/mods/status-jc/open.test.mjs` → FAIL (module introuvable).
- [ ] **Step 3:** écrire les trois fonctions dans `open.js` ; `prepareWorktree` utilise `watchPath(home(), repo, branch)`.
- [ ] **Step 4:** `node --test ~/.config/herdr-app/mods/*/*.test.mjs` → tout passe.
- [ ] **Step 5:** commit `feat(herdr): add the pure decisions of opening a watched PR` (`open.js`, `open.test.mjs`, `watcher.js`), push.

### Task 2: `status-jc` traite les demandes

**Files:**
- Create: `.config/herdr-app/mods/status-jc/opener.js`
- Modify: `.config/herdr-app/mods/status-jc/watcher.js` (exporter `findClone`)
- Modify: `.config/herdr-app/mods/status-jc/main.js` (appel dans le tick de 5 s)
- Modify: `.config/herdr-app/mods/status-jc/README.md`

**Interfaces:**
- Consumes: `watchPath`, `holdPause`, `toRelease`, `OpenEntry` (Task 1) ; `findClone(repo): Promise<string|null>` ; `checkoutsOf` (`watch.js`).
- Produces: `openRound(id: string): Promise<void>` dans `opener.js` ; clé partagée `"pr-open"`.

- [ ] **Step 1:** `openRound(id)` :
  1. Libération : pour chaque clé de `toRelease(shared("pr-open"), spaces().filter((s) => !s.machine).map((s) => s.folder))`, la retirer de `shared("pr-watch").paused` et de `pr-open`.
  2. Une entrée `error` plus vieille que 5 min est supprimée.
  3. Prendre une entrée `asked` (une par appel) et la réclamer avant tout `await` : `setShared("pr-open", { ...cur, [key]: { state: "opening", at: Date.now(), by: id } })`, puis relire et abandonner si `by !== id`. Une entrée `opening` de plus de 10 min (copie morte) redevient `asked`.
  4. `gh pr view <n> -R <repo> --json isDraft,headRefName` ; `findClone(repo)` (null → erreur « aucun clone local de <repo> »).
  5. Brouillon : dossier = `checkoutsOf(git worktree list --porcelain, branche)[0]`, sinon `wt switch <branche> --no-cd` dans le clone (timeout 600000) puis relire. Prête : dossier = `watchPath(...)` ; absent (`test -e`) → `git -C clone fetch origin <branche>` puis `git -C clone worktree add --detach <path> origin/<branche>`.
  6. Espace local avec `folder === dossier` → `run("space.select", { id })`, sinon `run("space.new", { folder, argv: ["claude"] })`.
  7. Prête : `holdPause` sur `pr-watch.paused` (écrire `pr-watch` en gardant le reste) ; `held` → entrée `{ state: "held", folder }`, sinon supprimer l'entrée. Brouillon : supprimer l'entrée.
  8. Toute erreur → `{ state: "error", at, error: message }`, rien en pause.
- [ ] **Step 2:** `main.js` : dans `refresh`'s tick de 5 s, appeler `openRound(this.openId ??= \`${Date.now()}-${Math.random()}\`)` sous un drapeau `this.opening` (un seul appel à la fois), erreurs en `console.log`.
- [ ] **Step 3:** `herdr-app check ~/.config/herdr-app/mods/status-jc` → OK ; `node --test ~/.config/herdr-app/mods/*/*.test.mjs` → tout passe.
- [ ] **Step 4: vérif manuelle** : `herdr-app` n'a pas d'API de test ; écrire à la main `shared` est impossible hors mod, donc la vérification bout en bout se fait en Task 3.
- [ ] **Step 5:** README de `status-jc` : section « Travailler sur une PR » (demande, brouillon/prête, pause posée et levée). Commit `feat(herdr): open a watched PR's worktree on request`, push.

### Task 3: le bouton dans le panneau `pr`

**Files:**
- Modify: `.config/herdr-app/mods/pr/main.js` (ligne de la Surveillance, à côté de `pause(k)`)
- Modify: `.config/herdr-app/mods/pr/README.md`, `.config/herdr-app/README.md` (cheatsheet)

**Interfaces:**
- Consumes: clé partagée `"pr-open"` et `OpenEntry` (Task 1).

- [ ] **Step 1:** bouton `id(\`work-${k}\`)`, même forme que `pause(k)`, icône `⌨`, tooltip « Travailler dessus », `cx.stop_propagation()`, clic → `setShared("pr-open", { ...(shared("pr-open") ?? {}), [k]: { state: "asked", at: Date.now() } })`. Ignoré si l'entrée est déjà `asked`/`opening`.
- [ ] **Step 2:** sous la ligne : « ouverture… » (couleur `t.dim`) pour `asked`/`opening`, l'erreur en `t.ansi1` pour `error`.
- [ ] **Step 3:** `herdr-app check ~/.config/herdr-app/mods/pr` → OK ; tests Node → passent.
- [ ] **Step 4: vérif manuelle dans Herdr** (surveillance active) :
  - PR prête avec `-watch` existant : clic → espace Claude sur le `-watch`, PR « en pause » ; fermer l'espace → reprise sous 5 s.
  - Même PR mise en pause à la main avant : après fermeture, toujours en pause.
  - Supprimer un `-watch` (`git worktree remove`) puis clic → recréé, espace ouvert.
  - PR brouillon sans worktree de branche → `wt` le crée, espace ouvert, pas de pause.
  - Clic sur une PR dont l'espace est déjà ouvert → il est sélectionné, pas de second espace.
- [ ] **Step 5:** README `pr` (bouton dans le schéma, ce qu'il fait) et cheatsheet. Commit `feat(herdr): add the work button to watch rows`, push.
