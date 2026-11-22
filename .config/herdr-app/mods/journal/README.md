# Mod `journal` : le panneau Journal

Notre mod (pas un clone). Il remplit le bloc `journal` du panneau latéral du layout `jc`, ouvert par le bouton Journal de `tabs-jc`. Il affiche ce que la surveillance des PR et le merge armé de [`status-jc`](../status-jc/README.md) ont fait, lu dans `~/Library/Logs/herdr-watch.log`. Il n'écrit rien : `status-jc` tient le fichier (voir sa section « Journal »).

## Ce que tu vois

```
Journal                          surveillance et merge
──────────────────────────────────────────────────────
03:31  arthur#5462  à toi : Jenkins encore en échec…   ← clic : la PR sur GitHub
03:12  arthur#5462  agent jenkins lancé
17/11 22:40  surveillance activée                      ← date devant l'heure si ce n'est pas aujourd'hui
            [ Plus ]  [ Tout le journal ]
```

- **Marqueur de lecture** : les lignes non lues en clair en haut, puis un trait « lu », puis les lues en grisé ; tout lu, le trait reste en tête. L'en-tête dit « N non lues » et propose **Tout lu**, qui pose le marqueur sur la dernière ligne. Le bouton Journal de la barre d'onglets porte, panneau fermé compris, une pastille rouge avec le nombre de non-lues qui demandent d'agir (« à toi », « erreur », « merge refusé », d'après `shared("journal-urgent")` publié par `status-jc`), ou un simple point s'il n'y a que des non-lues de routine.
- Le marqueur est un nombre de lignes du fichier, dans `shared("journal-read")`. `status-jc` publie le nombre de lignes dans `shared("journal-lines")` après chaque écriture, et le panneau le pose seulement s'il est absent (fichier écrit avant cette fonction). Pas de marqueur, ou un fichier plus court que lui (supprimé puis recréé) : tout est non lu.
- Les 20 dernières lignes, la plus récente en haut, lues avec le nombre de lignes du fichier en un seul passage `awk` (une écriture entre les deux décalerait le marqueur). **Plus** en lit 20 de plus, visible tant que le fichier en a davantage.
- **Tout le journal** : un nouvel onglet `less +G` sur le fichier, dans le space affiché.
- « Rien pour l'instant » tant que le fichier n'existe pas (ou n'a aucune ligne lisible). Une lecture en échec affiche l'erreur en rouge en tête du panneau.
- Relu à l'ouverture du panneau, et panneau ouvert dès que `shared("journal-lines")` change (`status-jc` le publie après chaque écriture). Pas de surveillance de dossier : `watchFolder` est refusé au-delà de 64 dossiers et `~/Library/Logs` bouge sans arrêt. Seule la dernière lecture lancée compte.

## Fichiers et tests

| Fichier | Rôle |
|---|---|
| `main.js` | La vue, la lecture par `awk`. |
| `model.js` | Fonctions pures : lecture des lignes, heure affichée, nombre de non-lues. Sans import Herdr. |
| `model.test.mjs` | Tests `node:test` de `model.js`. |

```sh
node --test ~/.config/herdr-app/mods/journal/model.test.mjs
herdr-app check ~/.config/herdr-app/mods/journal
```

Le chemin du fichier est recopié de `status-jc/journal.js` (un mod n'importe pas un autre mod) : les deux changent ensemble.

## Conception

[Journal de ce qui se passe sans moi](../../docs/2026-11-18-watch-journal-design.md)
