# projects (`⌘⇧O`)

Notre mod (pas un clone de Herdr) : ouvrir un space sur un de mes projets de `~/dev` en tapant quelques lettres. Le raccourci est dans `keys.json` : `"cmd-shift-o": "mod.open:projects"`. Le bouton dossier de l'en-tête de `spaces-jc` l'ouvre aussi. Design : [`docs/2026-11-23-projects-picker-design.md`](../../docs/2026-11-23-projects-picker-design.md).

## Ce que ça fait

- **La liste** : les dossiers à la racine de `~/dev` dont `.git` est un dossier. Les worktrees (`.git` est un fichier), `agents-worktree` et les dossiers sans git n'y sont pas.
- **L'ordre** : d'abord les projets ouverts récemment, du plus récent au plus ancien, puis les autres par date de leur dernier commit, puis par nom.
- **Taper** filtre sur le nom, sans tenir compte de la casse : le nom exact d'abord, puis ceux qui commencent par le texte, puis les autres.
- `↑` `↓` choisissent, `↵` ou un clic ouvre, `esc` ferme.
- **Ouvrir** : si un space local est sur le dépôt (marqué « ouvert »), on y va ; sinon un nouveau space dans `~/dev/<dépôt>`, qui prend le nom du dépôt.

## La récence

Le mod la garde dans son `localStorage` : `recent` (`{ "<dépôt>": <ms> }`) et `open` (les dépôts ouverts au dernier coup d'œil). Un dépôt prend la date du moment quand le mod l'ouvre, ou quand il est ouvert à l'ouverture de la fenêtre alors qu'il ne l'était pas la fois d'avant : un space laissé ouvert des jours ne remonte donc pas à chaque fois. Un space ouvert puis fermé autrement entre deux ouvertures de la fenêtre n'est pas vu.

Le dépôt d'un space est celui de son premier terminal, comme Herdr le nomme : un autre pane parti dans un autre dépôt ne compte pas. `view.json` (les 3 spaces fermés de Herdr) n'est pas lu : son `folder` est le dossier de création du space, pas son dépôt.

`~/dev` est un lien vers `/Volumes/sourcecode`, et Herdr donne les dossiers sous ce vrai chemin : `repoOfFolder()` essaie les deux.

Si `find` ne trouve aucun dépôt et échoue (`~/dev` absent), la fenêtre affiche « Impossible de lire ~/dev » et la raison, au lieu de « Aucun projet ».

## Les icônes

Chaque ligne montre l'icône JetBrains du dépôt, comme `spaces-jc` : `.idea/icon.svg` (sinon `icon.png`), et `icon_dark.svg` sur un thème sombre (`settings().dark`). `image()` ne lit que sous `~/.config/herdr-app` : un seul `sh` les copie à chaque ouverture dans `mods/projects/.icons/` (ignoré par git), en n'écrivant que ce qui a changé. Le dossier est caché parce que Herdr recharge un mod quand un fichier visible de son dossier change, ce qui relancerait la fenêtre. Un dépôt sans icône garde une case vide, pour aligner les noms.

## Les dates de commit

Lues à chaque ouverture par un seul `sh` qui lance `git log -1 --format=%ct` dans chaque dépôt (environ 4 s pour 170 dépôts). La liste s'affiche d'abord par récence puis par nom, et se réordonne quand les dates arrivent.

## Code

- `lib.js` : la partie pure (lister, trier, filtrer, lire les icônes copiées, trouver le space ouvert), testée par `lib.test.mjs` (`node --test`).
- `main.js` : la fenêtre (saisie, flèches, ouverture).
