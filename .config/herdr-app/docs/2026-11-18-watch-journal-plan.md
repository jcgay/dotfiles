# Journal de la surveillance : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `status-jc` écrit ce que font la surveillance et le merge armé dans `~/Library/Logs/herdr-watch.log`, un panneau Journal le montre.

**Architecture:** une fonction pure `journal.js` dans `status-jc` calcule les lignes d'un tour à partir des registres avant/après ; `watcher.js` et `merger.js` les ajoutent au fichier par `exec`. Un nouveau mod `journal`, bloc de la pile `panel-body` du layout `jc` avec un bouton dans `tabs-jc`, lit la fin du fichier avec `tail` et le suit avec `watchFolder`.

**Tech Stack:** mods Herdr (JavaScript, `gpui-kit`), `node --test`.

**Spec:** `docs/2026-11-18-watch-journal-design.md`

## Global Constraints

- Fichier : `${home()}/Library/Logs/herdr-watch.log`. Ligne : `YYYY-MM-DD HH:MM  owner/repo#n  texte` (heure locale, deux espaces entre les champs).
- Ligne sans PR (surveillance activée/coupée) : `owner/repo#n` remplacé par `-`.
- Au plus une ligne par PR et par tour ; lignes de PR seulement quand la surveillance est active (mon choix : surveillance coupée, rien n'est fait, seules ses lignes on/off sont écrites).
- Une écriture ratée est loguée (`console.log("journal:", …)`) et n'interrompt ni le tour ni le merge.
- Aucun import entre mods ; les modules testés n'importent rien de `herdr`.
- Ne jamais commiter `gpui-kit.d.ts` ni `jsconfig.json`.
- Textes en français, comme le reste du panneau.

## Review Focus

- Un `why` ou un message d'erreur sur plusieurs lignes : une seule ligne de journal (retours à la ligne remplacés par une espace). Test dans la tâche 1.
- Deux agents qui s'enchaînent dans le même tour sous le label « agent en cours » : deux lignes sur deux tours. Test dans la tâche 1.
- Fichier absent (premier lancement) : le panneau affiche « Rien pour l'instant », pas d'erreur. Test `parseTail("")` dans la tâche 3.
- Ligne mal formée ou écrite à la main dans le fichier : ignorée par le panneau. Test dans la tâche 3.
- Une ligne d'hier vue après minuit : date affichée devant l'heure. Test dans la tâche 3.

---

### Task 1: les lignes d'un tour (`status-jc/journal.js`)

**Files:**
- Create: `mods/status-jc/journal.js`, `mods/status-jc/journal.test.mjs`

**Interfaces:**
- Produces:
  - `roundLines(before: {on, journalOn?, prs}, after: {on, prs}, toasts: Map<key, string>) -> Array<{ key: string | null, text: string }>`
  - `formatLine(date: Date, key: string | null, text: string) -> string`
  - `JOURNAL_FILE = "Library/Logs/herdr-watch.log"` (relatif à `home()`)

Règles de `roundLines`, dans l'ordre :
1. `before.journalOn` défini et différent de `after.on` : `{ key: null, text: after.on ? "surveillance activée" : "surveillance coupée" }`.
2. Si `after.on` est faux : rien d'autre.
3. Pour chaque clé de `after.prs` : `launched.step`/`launched.head` différents de ceux d'avant (et `launched` présent) → `agent <step> lancé` ; sinon `label` différent (ou PR absente avant) → `<label> : <why>` (ou `<label>` sans why) ; sinon toast de la PR → son titre.
4. Pour chaque clé de `before.prs` absente de `after.prs` : `sortie de la surveillance`.

`formatLine` remplace tout `\s*\n\s*` du texte par une espace.

- [ ] **Step 1: Écrire les tests** : `journal.test.mjs` avec `node:test` et `assert/strict` :
  - lancement : avant `{label:"ok"}`, après `{label:"agent en cours", why:"agent rebase lancé sur 1a2b", launched:{step:"rebase", head:"1a2b"}}` → `[{key:"o/r#1", text:"agent rebase lancé"}]`
  - enchaînement : avant et après `label:"agent en cours"`, `launched.step` `pr-risk` → `pr-review` → `agent pr-review lancé`
  - fin : avant `agent en cours`, après `{label:"ok", why:"CI verte"}` → `ok : CI verte`
  - rien ne change → `[]`
  - nouvelle PR → son label ; PR disparue → `sortie de la surveillance`
  - toast sans changement → son titre ; toast avec changement de label → seulement la ligne du label
  - surveillance coupée (`after.on` faux) avec des changements de PR → seulement la ligne on/off si `journalOn` était `true`, sinon `[]`
  - `journalOn` indéfini → pas de ligne on/off
  - `formatLine(new Date(2026, 10, 18, 3, 7), "o/r#1", "x\n  y")` → `"2026-11-18 03:07  o/r#1  x y"` ; clé `null` → `"…  -  …"`
- [ ] **Step 2:** `node --test mods/status-jc/journal.test.mjs` → FAIL (module absent).
- [ ] **Step 3:** implémenter `journal.js`.
- [ ] **Step 4:** même commande → PASS.
- [ ] **Step 5:** commit `feat(herdr): compute the watch journal lines`.

### Task 2: écrire le journal (`watcher.js`, `merger.js`)

**Files:**
- Modify: `mods/status-jc/watcher.js` (boucle de `roundUnderLease`, son `return`), `mods/status-jc/merger.js` (`one`)
- Create: `mods/status-jc/journal-file.js`
- Modify: `mods/status-jc/README.md`

**Interfaces:**
- Consumes: `roundLines`, `formatLine`, `JOURNAL_FILE` (tâche 1).
- Produces: `appendJournal(entries: Array<{key, text}>) -> Promise<void>` dans `journal-file.js` : ne fait rien pour un tableau vide ; sinon `exec("sh", ["-c", 'f=$1; shift; printf "%s\\n" "$@" >> "$f"', "sh", file, ...lines])` (les lignes passent en arguments, jamais dans le script), erreur ou code non nul → `console.log("journal:", …)`, jamais de throw.

- [ ] **Step 1:** `watcher.js` : collecter `toasts` (Map `s.key` → `r.toast`) dans la boucle ; avant le `return` final, `await appendJournal(roundLines(registry, { on: registry.on, prs }, toasts))` et retourner aussi `journalOn: registry.on`. Le `return` d'erreur gh garde le registre tel quel (pas de ligne).
- [ ] **Step 2:** `merger.js` : après un merge réussi (ou trouvé `MERGED`), `appendJournal([{ key, text: "fusionnée" }])` ; refus : `merge refusé : <e.message>`.
- [ ] **Step 3:** `herdr-app check ~/.config/herdr-app/mods/status-jc` → OK, et `node --test ~/.config/herdr-app/mods/*/*.test.mjs` → PASS.
- [ ] **Step 4:** vérification à la main : `herdr-app` recharge le mod ; basculer l'interrupteur Surveillance, attendre le tour suivant (≤ 5 min) puis `tail ~/Library/Logs/herdr-watch.log` montre `surveillance activée` ou `coupée`.
- [ ] **Step 5:** README de `status-jc` : une ligne sur le journal. Commit `feat(herdr): log what the watch and the merge do`.

### Task 3: le panneau Journal

**Files:**
- Create: `mods/journal/mod.json` (`{ "place": "none", "title": "Journal" }`), `mods/journal/main.js`, `mods/journal/model.js`, `mods/journal/model.test.mjs`, `mods/journal/README.md`, `mods/tabs-jc/journal.svg`
- Modify: `layouts/jc.json` (bloc `journal` après `pr` dans `panel-body`), `mods/tabs-jc/main.js` (bouton et liste `syncPanel`), `README.md` de herdr-app, `~/.config/CLAUDE.md` (« `pr`, `start-work` et `journal` sont nos mods »)

**Interfaces:**
- Produces (`model.js`) :
  - `parseTail(text: string) -> Array<{ date: "YYYY-MM-DD", time: "HH:MM", key: string | null, repo: string | null, number: number | null, text: string, url: string | null }>`, la plus récente en premier, lignes mal formées ignorées ; `url` = `https://github.com/<owner/repo>/pull/<n>`.
  - `when(entry, today: "YYYY-MM-DD") -> string` : `"03:12"` aujourd'hui, `"17/11 22:40"` sinon.
  - `PAGE = 20`

- [ ] **Step 1: Écrire les tests** `model.test.mjs` : `parseTail("")` → `[]` ; deux lignes valides → ordre inversé, champs remplis, `url` construite ; ligne `-` → `key`/`url` `null` ; ligne `n'importe quoi` ignorée ; `when` aujourd'hui / hier / autre année (`"17/11 22:40"` même si l'année diffère : le panneau montre l'année courante la plupart du temps, raccourci accepté).
- [ ] **Step 2:** `node --test mods/journal/model.test.mjs` → FAIL.
- [ ] **Step 3:** implémenter `model.js` → tests PASS.
- [ ] **Step 4:** `main.js` : même cadre que `mods/pr/main.js` (en-tête 42 px « Journal », corps `overflow_y_scroll`, `visible()` sur le bloc `journal`). État `count = PAGE`. Lecture : `exec("tail", ["-n", String(count), file])` quand le panneau devient visible, au clic « Plus » (`count += PAGE`) et quand `watchFolder("~/Library/Logs")` signale le fichier (lu tout de suite si visible, sinon marqué à relire). Ligne : `when` en `t.dim`, `repo#n` (nom du dépôt seul) en gras, texte ; clic → `exec("open", [url])` si `url`. « Plus » visible quand `tail` a rendu `count` lignes. « Tout le journal » : `run("tab.new", { name: "Journal", argv: ["less", "+G", file] })`. Vide : « Rien pour l'instant ».
- [ ] **Step 5:** layout et `tabs-jc` : bloc `{ "id": "journal", "type": "block", "content": { "mod": "journal" } }` ; `syncPanel(..., [...enabled, "pr", "journal"])` ; `panelButton("journal", "mods/tabs-jc/journal.svg", "Journal")` après le bouton PR. Icône : un SVG 16×16 `currentColor` de liste (trois traits).
- [ ] **Step 6:** `herdr-app check` sur `mods/journal`, `mods/tabs-jc` et le layout ; `node --test ~/.config/herdr-app/mods/*/*.test.mjs` → PASS. Vérifier à la main : bouton Journal, lignes, Plus, Tout le journal.
- [ ] **Step 7:** README (herdr-app, mod `journal`), `~/.config/CLAUDE.md`. Commit `feat(herdr): add the Journal panel`.
