# tabs-jc

Clone du mod `tabs` de Herdr (version 0.1.15, voir `cloned_from` dans `mod.json`). C'est la barre d'onglets au-dessus des panes.

## Ce que le clone ajoute

- Un bouton « Pull request » à droite des tabs, après Files et Changes. Il ouvre le panneau latéral sur le mod `pr` ; recliquer le referme.
- Un bouton « Journal » (`journal.svg`) juste après, sur le mod `journal`, même mécanique. Sa pastille, en rouge (`t.blocked`), compte les lignes non lues qui demandent d'agir : les numéros de `shared("journal-urgent")` après le marqueur `shared("journal-read")` (tous si le fichier est plus court que le marqueur, la règle de `unread()` de `mods/journal/model.js`). Au-delà de 99 elle affiche « 99+ ». Des non-lues sans rien à traiter donnent un simple point. L'infobulle dit les deux nombres (« Journal : 1 à traiter sur 9 non lues »). Les lignes écrites avant `journal-urgent` ne comptent pas.
- Les boutons du panneau n'affichent plus que leur icône (le libellé passe en infobulle et en `accessibility_label`) : trois libellés prenaient trop de place dans la barre.
- Les icônes de fenêtre Windows (`win-*.svg`) pointent vers `mods/tabs-jc/` au lieu de `mods/tabs/`.

Le reste est l'original : renommer au double-clic, glisser pour déplacer, molette ou touchpad pour changer de tab, menu `+`.

## Le bouton PR

Files et Changes ne s'affichent que s'ils sont dans `workspace.panels` (réglé dans Settings). Les boutons PR et Journal, eux, sont toujours là : Settings ne connaît que Files et Changes, donc `pr` et `journal` ne sont jamais dans cette liste.

Un clic fait `layout.select` sur la pile `panel-body` (enfant `pr`) puis `layout.show` sur `panel`. `⌘⇧R` fait pareil : `keys.json` envoie `tabs-jc.panel:pr` au mod, que `nextCommand()` reçoit dans `togglePanel`. Le layout `jc` doit donc avoir un enfant `pr` dans `panel-body` qui monte le mod `pr` ; c'est le cas aujourd'hui. Avec un autre layout sans cet enfant, le bouton ne ferait rien d'utile (non vérifié).

## Le panneau mémorisé par space

Cette mémoire vient de l'original (`syncPanel`), elle n'est pas propre au clone. Le clone y ajoute seulement `pr` et `journal` à la liste des panneaux reconnus, pour qu'un panneau PR ou Journal soit lui aussi restauré.

À chaque rendu, `syncPanel` compare le space actif à celui du rendu précédent :

- Même space : le panneau visible (ou fermé) est enregistré pour ce space dans `localStorage["panels"]`.
- Autre space : il restaure le choix enregistré pour ce space. Un space jamais vu donne un panneau fermé, et un choix qui n'est plus dans la liste (Files retiré de Settings, par exemple) aussi.
- Pendant une seconde après une restauration, l'ancien état n'est pas enregistré : le temps que `layout.show` / `layout.hide` prenne effet.
- Au tout premier rendu après le démarrage, un space sans choix enregistré garde le panneau tel que le layout l'a laissé.

## Maintenance du clone

Herdr ne met jamais à jour un clone. L'original `mods/tabs/` est committé à côté : c'est la base de fusion. `herdr-upstream`, lancé par `dot`, fusionne dans `main.js` ce que Herdr a changé dans l'original depuis le dernier commit, en réécrivant les chemins `mods/tabs/` en `mods/tabs-jc/`.

En cas de `main.js.conflict` : reporter à la main les changements dans `main.js`, supprimer le `.conflict`, `herdr-app check ~/.config/herdr-app/mods/tabs-jc`, puis committer le clone et le nouvel original ensemble. Détails dans `~/.config/CLAUDE.md`, section « Herdr desktop app ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.js` | Le mod, original + boutons PR et Journal, boutons en icône seule |
| `mod.json` | `cloned_from` : ce que `herdr-upstream` lit pour trouver l'original |
| `pull-request.svg` | Icône du bouton PR, ajoutée par le clone |
| `journal.svg` | Icône du bouton Journal, ajoutée par le clone |
| `win-*.svg` | Boutons de fenêtre sous Windows, copiés de l'original |
| `gpui-kit.d.ts`, `jsconfig.json` | Écrits par Herdr, ne pas committer |

## Pièges

- L'état du panneau par space est dans le `localStorage` du mod, pas dans un fichier : il ne se committe pas et ne suit pas d'une machine à l'autre.
- Les ids de space servent de clés et ne sont jamais purgés : un space fermé laisse son entrée.
- Ajouter ou modifier un fichier dans ce dossier pendant que Herdr tourne recharge le mod.
