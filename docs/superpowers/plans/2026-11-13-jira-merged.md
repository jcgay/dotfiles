# jira-merged Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un job launchd passe en Done Dev les tickets JIRA de mes PR `softwarevidal` mergées, et me notifie.

**Architecture:** Un script bash dans `~/.local/bin`, dont les fonctions pures sont sourçables par un self-check voisin. Un LaunchAgent le lance via `fish -c`, pour hériter du PATH Homebrew et des jetons (`GITHUB_TOKEN`, `JIRA_API_TOKEN` viennent de `~/.config/fish/conf.d/secrets.fish`). Il n'y a pas d'état : la fenêtre de 7 jours et le garde-fou de statut rendent chaque passage idempotent.

**Tech Stack:** bash, `gh`, `jira` (ankitpokhrel/jira-cli), `jq`, `osascript`, launchd, yadm (classe `Work`).

**Spec:** `~/docs/superpowers/specs/2026-11-13-jira-merged-design.md`

## Global Constraints

- Les fichiers versionnés portent le suffixe yadm `##class.Work`. Ils sont committés avec `rtk proxy yadm` (le yadm nu échoue sous le hook RTK).
- Organisation : `softwarevidal`. Fenêtre : PR mergées depuis 7 jours.
- Statut cible, écrit à l'identique : `Done Dev`. Statuts qu'on déplace : `En cours` seulement.
- Commentaire JIRA : `PR <owner/repo>#<n> mergée`.
- Horaires : du lundi au vendredi, de 08:00 à 19:00 inclus, lancement à :00 et :30.
- Les messages de commit suivent `~/.claude/rules/git-commit.md` (anglais, corps qui explique le pourquoi, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Review Focus

- Clé citée dans le titre après le `:` (« Fix regression from MERLIN-2300 ») : elle est ignorée. Test `keys_of` dans la tâche 1.
- Faux positif de forme clé dans une branche (`utf-8-fix`) : il ne matche pas, les clés exigent des majuscules. Test de la tâche 1.
- Ticket inexistant, ou `jira` en erreur (jeton expiré, réseau) : notification « à faire à la main », le script continue sur les autres tickets. Test de la tâche 2.
- La même clé dans la branche et dans le titre ne donne qu'un seul déplacement. Test de la tâche 1 (dédoublonnage).
- Hors horaires (samedi, 19:30, 07:59) : le script sort sans appeler `gh`. Tests `working_hours` de la tâche 1 et `main` de la tâche 2.

---

### Task 1: Fonctions pures et self-check

**Files:**
- Create: `~/.local/bin/jira-merged##class.Work` (exécutable ; yadm crée le lien `~/.local/bin/jira-merged`)
- Create: `~/.local/bin/jira-merged.test##class.Work` (exécutable)

**Interfaces:**
- Produces, dans `jira-merged` (sourçable : `main "$@"` n'est appelé que si `[[ ${BASH_SOURCE[0]} == "$0" ]]`) :
  - `keys_of <branch> <title>` : affiche les clés uniques, une par ligne, dans l'ordre (branche puis titre). Motif `[A-Z][A-Z0-9]+-[0-9]+` sur toute la branche, et sur le titre seulement avant le premier `:` (un titre sans `:` ne donne aucune clé).
  - `movable <status>` : code 0 seulement pour `En cours`.
  - `working_hours <jour 1-7> <HHMM>` : code 0 seulement si jour ≤ 5 et `0800` ≤ HHMM ≤ `1900`.

- [ ] **Step 1: Écrire le self-check** (style de `~/.claude/hooks/github-signature.test` : muet si tout passe, `FAIL …` et code 1 sinon). Il source `./jira-merged` depuis son dossier.

```bash
eq "$(keys_of APIREST-1529-compress-prisca-url 'APIREST-1529: Erreur 400')" "APIREST-1529"
eq "$(keys_of feat 'MERLIN-1, MERLIN-2: Sujet')" $'MERLIN-1\nMERLIN-2'
eq "$(keys_of fix-thing 'Fix regression from MERLIN-2300')" ""
eq "$(keys_of utf-8-fix 'Handle UTF-8: bytes')" "UTF-8"   # branche en minuscules : rien ; titre : voir note
eq "$(keys_of redundant-alert 'Compute the period once')" ""
ok movable "En cours"; ko movable "Code Review"
ko movable "Done Dev"; ko movable "Ouvert"; ko movable "Rouvert"
ok working_hours 1 0800; ok working_hours 5 1900; ok working_hours 3 1230
ko working_hours 6 1000; ko working_hours 7 1000; ko working_hours 2 0759; ko working_hours 2 1930
```

Note sur `UTF-8` : le motif `[A-Z][A-Z0-9]+-[0-9]+` matche `UTF-8` dans un titre. Ce n'est pas un problème : `jira issue view UTF-8` échoue, la tâche 2 notifie « à faire à la main » et ne déplace rien. Mets ce commentaire dans le script : une fausse clé coûte une notification, jamais un déplacement.

- [ ] **Step 2: Lancer et voir échouer** — `~/.local/bin/jira-merged.test` → erreur `jira-merged: No such file`, ou `FAIL` sur chaque ligne.

- [ ] **Step 3: Écrire les trois fonctions** dans `~/.local/bin/jira-merged##class.Work`, avec `#!/usr/bin/env bash` et `set -uo pipefail`. Mets un en-tête de commentaire de 3 lignes sur le pourquoi (l'oubli du ticket, la spec). `keys_of` passe par `grep -oE` puis `awk '!seen[$0]++'`.

- [ ] **Step 4: Lancer et voir passer** — `~/.local/bin/jira-merged.test` ne doit rien afficher et sortir en code 0.

- [ ] **Step 5: Commit**

```bash
cd ~ && rtk proxy yadm add '.local/bin/jira-merged##class.Work' '.local/bin/jira-merged.test##class.Work'
rtk proxy yadm commit   # "Extract JIRA keys of a merged PR", corps : pourquoi titre-avant-':' seulement
```

### Task 2: `main` — trouver, déplacer, notifier

**Files:**
- Modify: `~/.local/bin/jira-merged##class.Work`
- Modify: `~/.local/bin/jira-merged.test##class.Work`

**Interfaces:**
- Consumes: `keys_of`, `movable`, `working_hours` (tâche 1).
- Produces: `main` (sans argument). Variable d'environnement de test `JIRA_MERGED_NOW="<jour> <HHMM>"`, qui remplace `date '+%u %H%M'`. `notify <titre> <message>` passe par `osascript -e 'display notification … with title …'`. Les arguments sont passés par `on run argv` pour qu'aucune guillemet d'un titre de PR ne casse le script.

Déroulé de `main` :
1. `working_hours $(…now…)` sinon `exit 0`.
2. `gh search prs --owner softwarevidal --author @me --merged --merged-at ">=$(date -v-7d +%F)" --json number,title,url,repository --limit 100`.
3. Pour chaque PR : `gh pr view <url> --json headRefName -q .headRefName`, puis `keys_of`.
4. Pour chaque clé : `jira issue view <clé> --raw | jq -r .fields.status.name`. Si l'appel échoue → `notify "À faire à la main" "<clé> (PR repo#n) : ticket illisible"`. Si `movable` → `jira issue move <clé> "Done Dev" --comment "PR <repo>#<n> mergée"`. Succès → `notify "<clé> → Done Dev" "<titre de la PR>"`, échec → `notify "À faire à la main" "<clé> : Done Dev refusé"`. Sinon on ne fait rien.
5. Toute erreur de `gh` → `notify "jira-merged" "gh a échoué"`, puis code 1. Le log reste sur stderr, et launchd l'écrit dans un fichier (tâche 3).

- [ ] **Step 1: Ajouter au self-check un test de `main` avec de faux `gh`, `jira` et `osascript`** placés dans un `PATH` temporaire. Chaque faux outil ajoute sa ligne de commande à `$tmp/calls`.
  - le faux `gh search` renvoie deux PR : `{"number":5452,"title":"APIREST-1529: Erreur 400","url":"u1","repository":{"nameWithOwner":"softwarevidal/arthur"}}` et `{"number":7,"title":"MERLIN-9: Déjà fait","url":"u2","repository":{"nameWithOwner":"softwarevidal/arthur"}}` ; le faux `gh pr view` renvoie `x` ;
  - le faux `jira issue view` renvoie le statut `En cours` pour APIREST-1529, `Done Dev` pour MERLIN-9, et sort en code 1 pour toute autre clé.

```bash
JIRA_MERGED_NOW="2 1000" main
grep -q 'issue move APIREST-1529 Done Dev --comment PR softwarevidal/arthur#5452 mergée' "$tmp/calls" || fail
! grep -q 'issue move MERLIN-9' "$tmp/calls" || fail
grep -q 'osascript' "$tmp/calls" || fail          # une notification pour APIREST-1529
: > "$tmp/calls"; JIRA_MERGED_NOW="6 1000" main
[ ! -s "$tmp/calls" ] || fail                      # samedi : aucun appel
```

Ajoute un troisième cas : une PR `"title":"NOPE-1: x"` (le faux `jira issue view` échoue) donne une notification et aucun `issue move`, et `main` continue sans s'arrêter.

- [ ] **Step 2: Lancer et voir échouer** — `~/.local/bin/jira-merged.test` → `FAIL` sur les nouveaux cas, ou `main: command not found`.

- [ ] **Step 3: Implémenter `main` et `notify`** selon le déroulé ci-dessus.

- [ ] **Step 4: Lancer et voir passer** — `~/.local/bin/jira-merged.test`, muet, code 0. Puis `shellcheck ~/.local/bin/jira-merged ~/.local/bin/jira-merged.test` sans aucun avertissement.

- [ ] **Step 5: Essai à blanc sur les vraies données** — ajoute un mode `JIRA_MERGED_DRY_RUN=1`, qui affiche les `jira issue move` au lieu de les lancer, et garde le test du Step 1 vert. Lance `JIRA_MERGED_DRY_RUN=1 JIRA_MERGED_NOW="2 1000" fish -c jira-merged`. On attend au moins `jira issue move APIREST-1529 Done Dev …` (mergée le 12/11, encore « En cours »), et rien pour les PR sans clé.

- [ ] **Step 6: Commit** — `"Move tickets of my merged PRs to Done Dev"`, avec dans le corps le garde-fou de statut et l'absence d'état.

### Task 3: LaunchAgent et bootstrap

**Files:**
- Create: `~/Library/LaunchAgents/fr.jcgay.jira-merged.plist##class.Work`
- Modify: `~/.config/yadm/bootstrap` (bloc `Work`, à côté de celui de sonarqube-cli, ligne ~64)

**Interfaces:**
- Consumes: `~/.local/bin/jira-merged` (tâche 2).

- [ ] **Step 1: Écrire le plist** — Label `fr.jcgay.jira-merged`. ProgramArguments `/opt/homebrew/bin/fish`, `-c`, `jira-merged`. `StartCalendarInterval` = `[{Minute:0},{Minute:30}]` (le filtre jours/heures est dans le script). `StandardOutPath`/`StandardErrorPath` = `/Users/jcgay/Library/Logs/jira-merged.log`. Pas de `RunAtLoad`.

- [ ] **Step 2: Vérifier la syntaxe** — `plutil -lint ~/Library/LaunchAgents/fr.jcgay.jira-merged.plist`, qui doit répondre `OK`.

- [ ] **Step 3: Charger depuis bootstrap** — dans le bloc `Work`, `launchctl bootout gui/$(id -u)/fr.jcgay.jira-merged 2>/dev/null; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/fr.jcgay.jira-merged.plist`. Le bootout d'abord rend le bloc rejouable. Exécute ces deux lignes à la main, pas tout le bootstrap, qui est interactif.

- [ ] **Step 4: Vérifier le chargement** — `launchctl print gui/$(id -u)/fr.jcgay.jira-merged | grep -E 'state|program'` doit montrer le job avec `fish`. Puis `launchctl kickstart gui/$(id -u)/fr.jcgay.jira-merged` et `tail ~/Library/Logs/jira-merged.log` : aucune erreur `command not found` ni d'authentification. En semaine aux heures ouvrées, APIREST-1529 passe réellement en Done Dev, avec une notification. Préviens l'utilisateur avant ce kickstart : c'est la première écriture réelle dans JIRA.

- [ ] **Step 5: Commit** — `"Run jira-merged every half hour on workdays"`, avec dans le corps pourquoi `fish -c` (le PATH Homebrew et les jetons de secrets.fish).
