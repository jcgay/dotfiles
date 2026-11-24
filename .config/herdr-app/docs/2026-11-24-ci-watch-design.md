# Panneau CI : les branches longues des dépôts où j'ai contribué

## Pourquoi

Je veux savoir d'un coup d'œil si la CI Jenkins des branches longues (`main`, `master`, `develop`,
`sprint-*`, `release/*`) des dépôts où j'ai travaillé cette semaine est verte, que la casse vienne de moi ou d'un
autre, et pouvoir lancer tout de suite un agent qui la répare. Les PR sont hors sujet : la
Surveillance les suit déjà.

## Objectifs, non-objectifs

- **Objectif** : une liste à jour du dernier build de chaque branche longue de ces dépôts, et un
  bouton qui confie un build rouge à un agent Claude.
- **Non-objectif** : alerter quand le panneau est fermé (toast, barre d'état). Ce serait l'approche
  B ci-dessous, à reprendre plus tard si le besoin se confirme.
- **Non-objectif** : réparer sans clic. Une casse qui n'est pas de moi n'est pas forcément à moi.
- **Anti-objectif** : pousser directement sur une branche longue. Le correctif passe toujours par
  une branche et une PR brouillon (règle « jamais de commit sur master »).

## Approches

- **A. Une troisième vue du mod `pr` (`view: ci`), qui va chercher ses données elle-même** :
  retenue. Elle n'appelle gh et jk que panneau ouvert, comme la vue Pull request, et réutilise
  `jenkinsBuild`, `minutes` et la relance de `pr/main.js` / `model.js`.
- **B. La logique dans `status-jc`, le panneau ne fait qu'afficher `shared()`** : permettrait une
  alerte panneau fermé, mais `status-jc` fait déjà ~2000 lignes et Jenkins serait interrogé en
  permanence. Écartée pour l'instant.
- **C. Un mod `ci` séparé** : même comportement que A, mais il devrait recopier les helpers de `pr`
  (un mod ne peut pas importer les fichiers d'un autre). Écartée.

## Ce que je vois

```
CI des branches longues              il y a 1 min  [rafraîchir]
────────────────────────────────────────────────────────────
gradle-soup-plugin
  ● master    #212 échec   il y a 3 h   [log] [relance] [Corriger]
docker-lib-karadoc
  ● master    #88  ok      hier
  ● sprint-42 #14  en cours 4 min
vira
  ● develop   #301 échec   il y a 20 min  fix en cours → #5520
```

- Groupé par dépôt, les dépôts avec une branche rouge en tête, puis par nom.
- Chaque ligne : pastille (vert ok, rouge échec/instable/abandonné, orange clignotant en cours),
  branche, numéro, résultat, âge ou durée en cours. Clic sur la ligne : le build dans le navigateur.
- **log** ouvre la console ; **relance** (`jk run rerun`) n'apparaît que sur un build terminé qui
  n'a pas réussi, comme dans la vue Pull request.
- **Corriger** apparaît sur tout build rouge terminé : `FAILURE`, `UNSTABLE` (les tests en échec
  donnent souvent ce résultat) et `ABORTED`. La consigne est la même, et c'est l'agent qui choisit
  entre relancer et corriger. *(Mon choix.)*
- **Fix en cours** : chaque build a sa propre branche `fix/ci-<branche>-<N>`, où les `/` de la branche deviennent des `-` (`fix/ci-release-v4-12`). Le bouton est remplacé
  par « fix en cours → #PR » quand une PR ouverte part d'une branche `fix/ci-<branche>-*`, ou par
  « fix en cours » quand le worktree `fix/ci-<branche>-<N>` du build affiché existe. Un clic mène à
  son space s'il est ouvert, sinon à la PR. Un worktree resté d'un ancien build (fix mergé, simple
  relance) ne masque donc pas le bouton sur un nouveau build rouge, et un nouvel agent part toujours
  de l'`origin/<branche>` à jour. *(Mon choix.)*
- Hors VPN : « Jenkins injoignable (VPN ?) », comme ailleurs. Aucun dépôt : « Aucune contribution de toi
  depuis 7 jours ». Des dépôts mais aucun build de branche longue dans la fenêtre : « Aucun build de
  branche longue cette semaine ».

## D'où viennent les données

1. **Mes dépôts** : l'union de deux recherches GitHub, dédoublonnée :
   - mes PR mergées depuis 7 jours, quelle que soit leur branche cible :
     `gh search prs --author=@me --merged-at=">J-7" --owner softwarevidal --json repository --limit 1000` ;
   - mes commits depuis 7 jours :
     `gh search commits --author=@me --committer-date=">J-7" --owner softwarevidal --json repository --limit 1000`.
   La recherche de commits suffit pour la branche par défaut, squash merges compris (le commit
   gardé est à mon nom), et voit aussi les pushs directs (docker-lib-karadoc le 2026-11-24). Elle
   n'indexe que la branche par défaut : les PR mergées rattrapent les dépôts où je n'ai contribué
   que vers `sprint-*` ou `release/*`. Un push direct sur une de ces branches reste invisible,
   c'est accepté. Les deux recherches se limitent à l'organisation `softwarevidal`, écrite en dur
   pour l'instant (la rendre configurable viendra dans une PR suivante). Sans ce filtre, avec une
   limite de 100, les commits des dotfiles remplissaient la réponse et cachaient 5 dépôts de
   travail sur 7 ; la limite reste haute par prudence.
2. **Leurs jobs** : pour chaque dépôt, les jobs Jenkins dont le nom (décodé : `release%2Fv4` donne
   `release/v4`) est une branche longue (`main`, `master`, `develop`, `sprint-*`, `release/*`) et
   qui ont un build dans les 7 derniers jours. Les jobs observés sont
   `team.software/github/<repo>/<branche>`, qu'on liste avec
   `jk job ls team.software/github/<repo> --json`. Un dépôt sans job Jenkins (dotfiles) n'apparaît
   pas.
3. **Le dernier build** de chaque job, avec `jk run ls <jobPath> --limit 1 --json` : résultat,
   numéro, `startTime`, `durationMs`, `url`.

Rafraîchi à l'ouverture du panneau, toutes les 60 s tant qu'il est affiché, et sur « rafraîchir ».
La liste des dépôts (étape 1) et des jobs (étape 2) change peu : un cache de 15 min suffit ; seul le
dernier build est relu à chaque tour. Panneau fermé : aucun appel.

## Corriger

Un clic sur **Corriger** pour `<repo>`/`<branche>`, build `#N` :

1. Trouver le clone local du dépôt (même recherche que `findClone` de `status-jc` : spaces ouverts,
   `~/dev/agents-worktree/<repo>/*`, `~/dev/<repo>`). Sans clone : erreur « aucun clone local de
   <repo> » sous la ligne.
2. `git fetch origin <branche>`, puis un worktree sur une nouvelle branche `fix/ci-<branche>-<N>` partie
   de `origin/<branche>` (avec `wt switch --create … --base origin/<branche>` comme `start-work`,
   ou `git worktree add -b`). S'il existe déjà (même build), on le réutilise tel quel.
3. Un space sur ce worktree (ou celui qui le montre déjà) avec un onglet Claude et une consigne
   initiale : lire le log avec `jk log <jobPath> <N>` ; si l'échec vient de l'infrastructure ou d'un
   test instable, relancer avec `jk run rerun <jobPath> <N>` sans rien pousser et le dire ; sinon
   corriger, committer, pousser `fix/ci-<branche>-<N>` et ouvrir une PR brouillon vers `<branche>`.
   Sans VPN, le dire et s'arrêter (même consigne que l'agent jenk de `status-jc`).
4. « ouverture… » puis l'éventuelle erreur s'affichent sous la ligne.

La PR brouillon entre ensuite d'elle-même dans la Surveillance.

## Dans Herdr

- Un bloc `ci` dans la pile `panel-body` du layout `jc`, `{ "mod": "pr", "props": { "view": "ci" } }`.
- Un bouton dans `tabs-jc` à côté de Surveillance, avec son icône, et un raccourci
  `tabs-jc.panel:ci` dans `keys.json`.
- `visible("ci")` garde les timers muets panneau caché, comme pour `pr`.

## Laissé au constructeur

- Le raccourci : une touche `cmd-shift-…` libre dans `keys.json`.
- Comment lister les jobs d'un dépôt (`jk job ls team.software/github/<repo>`, ou `jk search
  --job-glob`), selon ce qui est le plus rapide ; ne pas scanner les 113 jobs `*master*` à chaque
  tour.
- Où vivent la recherche de clone et la préparation du worktree : copie dans le mod `pr` (pas
  d'import entre mods) ; la logique pure (filtre des branches longues, tri, état de la ligne) va
  dans `pr/ci-model.js` avec ses tests (`ci-model.test.mjs`), et la vue dans `pr/ci.js` : `main.js`
  porte déjà deux panneaux.
- L'icône du bouton.
- Mettre à jour `pr/README.md`, `.config/herdr-app/README.md` et le CLAUDE.md des dotfiles.
