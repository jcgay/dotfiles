# Travailler sur une PR de la surveillance

Complète `2026-11-14-pr-watch-design.md` et `2026-11-16-pr-watch-pause-design.md`.

## Pourquoi

Le clic sur une ligne de la Surveillance va sur l'agent s'il tourne, sinon ouvre la PR sur GitHub.
Ce comportement reste. Il manque une action « je veux travailler sur cette PR » qui m'ouvre un
espace avec Claude dans le bon worktree, en le créant s'il le faut.

## Ce que fait l'action

Un bouton par ligne, à côté du ⏸, tooltip « Travailler dessus ». Son clic ne déclenche pas celui
de la ligne.

- **PR en brouillon** (la surveillance n'y fait rien) : le worktree de la branche, comme la reprise
  de `start-work`. Déjà sorti : il est utilisé tel quel. Sinon `wt switch <branche> --no-cd` le crée.
  Pas de pause.
- **PR prête** : le worktree de la surveillance, `…/agents-worktree/<repo>/<branche>-watch`.
  Il existe : utilisé tel quel, commits de l'agent et modifications compris (jamais remis sur
  origin). Il n'existe plus : recréé détaché sur `origin/<branche>`, comme le fait la surveillance.
  La PR est **mise en pause** pour qu'aucun agent n'y parte pendant que j'y travaille.
- Dans les deux cas : un espace déjà ouvert sur ce dossier est sélectionné, sinon un nouvel espace
  s'ouvre avec `claude`, sans prompt, et prend le focus.
- **Fin de la pause** : quand plus aucun espace local n'est ouvert sur le `-watch`, la pause posée
  par l'action est levée. Une PR déjà en pause avant l'action (pause à la main) le reste.
- Erreur (pas de clone local, fetch ou worktree en échec) : affichée sur la ligne, rien n'est ouvert,
  pas de pause.

## Approches

- **A, retenue** : le panneau écrit une demande dans `shared("pr-open")`, `status-jc` l'exécute. Pas dans
  `shared("pr-watch")` : le tour de surveillance réécrit ce registre en fin de tour.
  C'est lui qui sait retrouver le clone et créer le `-watch` (`prepareWorktree`), et un mod ne peut
  pas importer le fichier d'un autre. Une seule façon de fabriquer ce dossier.
- B : le panneau fait tout. Instantané, mais copie la recherche du clone et la création du worktree
  dans `pr` ; les deux finiraient par diverger.

## Contraintes

- La demande est relevée par le tick de 5 s de `status-jc`, pas par le tour de surveillance (5 min).
  Le panneau affiche « ouverture… » sur la ligne tant qu'elle n'est pas traitée.
- Le panneau ne connaît ni la branche ni le clone : `status-jc` les retrouve (`gh pr view`, son cache
  de clones).
- Une PR fermée ou mergée garde le comportement actuel : la surveillance ferme ses espaces `-watch`.

## Laissé au builder

- La forme exacte de la demande et de la liste des pauses posées par l'action dans le registre
  (elles doivent survivre au merge de `setShared` fait en fin de tour, comme `on` et `paused`).
- L'icône du bouton.
- Le passage d'une PR de brouillon à prête pendant que je travaille dans le worktree de la branche :
  la logique « branche occupée » existante s'en charge déjà.
- Mettre à jour `mods/pr/README.md` et `mods/status-jc/README.md`.
