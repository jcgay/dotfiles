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

- Les 20 dernières lignes (`tail -n`), la plus récente en haut. **Plus** en lit 20 de plus, visible tant que `tail` en rend autant que demandé.
- **Tout le journal** : un nouvel onglet `less +G` sur le fichier, dans le space affiché.
- « Rien pour l'instant » tant que le fichier n'existe pas.
- Relu à l'ouverture du panneau, quand `watchFolder(~/Library/Logs)` signale le fichier (panneau caché : relu à la prochaine ouverture), et toutes les minutes panneau ouvert (Herdr peut reprendre une surveillance de dossier inactive).

## Fichiers et tests

| Fichier | Rôle |
|---|---|
| `main.js` | La vue, la lecture par `tail`, la surveillance du dossier. |
| `model.js` | Fonctions pures : lecture des lignes, heure affichée. Sans import Herdr. |
| `model.test.mjs` | Tests `node:test` de `model.js`. |

```sh
node --test ~/.config/herdr-app/mods/journal/model.test.mjs
herdr-app check ~/.config/herdr-app/mods/journal
```

Le chemin du fichier est recopié de `status-jc/journal.js` (un mod n'importe pas un autre mod) : les deux changent ensemble.

## Conception

[Journal de ce qui se passe sans moi](../../docs/2026-11-18-watch-journal-design.md)
